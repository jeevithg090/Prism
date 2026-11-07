// Readiness Explained · exact Shapley values (pure, isomorphic).
//
// Keystone's readiness is Σ_skills w_s · coverage_s, and a skill's coverage is the best of its sources: a proof
// (1.0), a finished module (0.7) or a module still to come (0.4). That makes every skill a "max game" over its
// sources, and the whole score a sum of independent max games. Shapley values are linear, so each source's
// exact share of readiness is the sum of its shares in the skills it touches. Two ways to compute a max game:
//  - shapleyMaxClosedForm: sort the values; each increment is split equally among the players that reach it
//  - shapleyExact: enumerate all 2^k coalitions (used to cross-check the closed form on every run)

/** Exact Shapley values of a cooperative game with n players, by enumerating all 2^n coalitions. n ≤ 16. */
export function shapleyExact(n: number, value: (mask: number) => number): number[] {
  if (!Number.isInteger(n) || n < 0 || n > 16) throw new RangeError(`shapleyExact supports 0..16 players, got ${n}`);
  if (n === 0) return [];
  const fact = [1];
  for (let i = 1; i <= n; i++) fact[i] = fact[i - 1] * i;
  const size = 1 << n;
  const v = new Float64Array(size);
  const pop = new Uint8Array(size);
  for (let m = 0; m < size; m++) {
    v[m] = value(m);
    pop[m] = m === 0 ? 0 : pop[m >> 1] + (m & 1);
  }
  const phi = new Array<number>(n).fill(0);
  for (let m = 0; m < size; m++) {
    const s = pop[m];
    const weight = (fact[s] * fact[n - s - 1]) / fact[n];
    for (let i = 0; i < n; i++) {
      if (m & (1 << i)) continue;
      phi[i] += weight * (v[m | (1 << i)] - v[m]);
    }
  }
  return phi;
}

/** v(S) = max of the members' values (0 for the empty coalition). */
export const maxGame = (values: number[]) => (mask: number): number => {
  let best = 0;
  for (let i = 0; i < values.length; i++) if (mask & (1 << i) && values[i] > best) best = values[i];
  return best;
};

/**
 * Closed form for the max game: with values sorted ascending c(1) ≤ … ≤ c(k), the increment c(j) − c(j−1) is
 * earned by every player whose value is at least c(j), so it is split equally among the k − j + 1 of them.
 */
export function shapleyMaxClosedForm(values: number[]): number[] {
  const k = values.length;
  const order = values.map((v, i) => ({ v: Math.max(0, v), i })).sort((a, b) => a.v - b.v);
  const phi = new Array<number>(k).fill(0);
  let prev = 0;
  let acc = 0;
  for (let j = 0; j < k; j++) {
    acc += (order[j].v - prev) / (k - j);
    prev = order[j].v;
    phi[order[j].i] = acc;
  }
  return phi;
}

/** What each player is worth at the margin: v(N) − v(N \ {i}). Shows redundancy that Shapley shares out. */
export function leaveOneOut(n: number, value: (mask: number) => number): number[] {
  const all = n ? (1 << n) - 1 : 0;
  const full = value(all);
  return Array.from({ length: n }, (_, i) => full - value(all & ~(1 << i)));
}

export const round1 = (x: number) => Math.round(x * 10) / 10;
export const round3 = (x: number) => Math.round(x * 1000) / 1000;
