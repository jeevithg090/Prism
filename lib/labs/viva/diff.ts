// Keystone Labs · Viva Check: a small unified-diff reader (pure). Turns `git diff` text into numbered lines so
// every viva question can point at real lines of the student's own change.
import type { DiffLine } from "./model";

export const MAX_DIFF_LINES = 400;

/** Parses a unified diff. Lines outside a hunk header are kept as `meta`; at most MAX_DIFF_LINES lines. */
export function parseDiff(raw: string): DiffLine[] {
  const out: DiffLine[] = [];
  let file = "";
  let newLine = 0;
  let inHunk = false;
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    if (out.length >= MAX_DIFF_LINES) break;
    const git = line.match(/^diff --git a\/(\S+) b\/(\S+)/);
    if (git) { file = git[2]; inHunk = false; out.push({ i: out.length, file, kind: "meta", text: line }); continue; }
    const plus = line.match(/^\+\+\+ (?:b\/)?(\S+)/);
    if (plus) { if (plus[1] !== "/dev/null") file = plus[1]; inHunk = false; out.push({ i: out.length, file, kind: "meta", text: line }); continue; }
    if (/^--- /.test(line) && !inHunk) { out.push({ i: out.length, file, kind: "meta", text: line }); continue; }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { newLine = Number(hunk[1]); inHunk = true; out.push({ i: out.length, file, kind: "meta", text: line }); continue; }
    if (!inHunk) { if (line.trim()) out.push({ i: out.length, file, kind: "meta", text: line }); continue; }
    if (line.startsWith("+")) { out.push({ i: out.length, file, kind: "add", newLine: newLine > 0 ? newLine : 1, text: line.slice(1) }); newLine++; continue; }
    if (line.startsWith("-")) { out.push({ i: out.length, file, kind: "del", text: line.slice(1) }); continue; }
    if (line.startsWith("\\")) continue; // "\ No newline at end of file"
    out.push({ i: out.length, file, kind: "ctx", newLine: newLine > 0 ? newLine : 1, text: line.startsWith(" ") ? line.slice(1) : line });
    newLine++;
  }
  // A trailing empty context line from the final newline is noise.
  while (out.length && out[out.length - 1].kind === "ctx" && !out[out.length - 1].text.trim()) out.pop();
  return out;
}

export const addedLines = (lines: DiffLine[]) => lines.filter((l) => l.kind === "add");

/** Added lines that carry code (not blank, not a comment). */
export function codeLines(lines: DiffLine[]): DiffLine[] {
  return addedLines(lines).filter((l) => {
    const t = l.text.trim();
    return t.length > 0 && !/^(#|\/\/|--|\/\*|\*)/.test(t);
  });
}

export const filesIn = (lines: DiffLine[]) => [...new Set(lines.filter((l) => l.kind === "add").map((l) => l.file))];

const EXT_SKILL: [RegExp, string][] = [
  [/(^|\/)Dockerfile$|(^|\/)docker-compose\.ya?ml$|\.dockerfile$/i, "docker"],
  [/\.sql$/i, "sql"],
  [/\.(tsx|jsx)$/i, "react"],
  [/\.py$/i, "python"],
  [/\.ts$/i, "typescript"],
  [/\.js$/i, "javascript"],
  [/\.ya?ml$/i, "ci-cd"],
];

/** Best guess at the diff's skill from its file names (the file with the most added lines wins). */
export function guessSkill(lines: DiffLine[]): string | undefined {
  const counts = new Map<string, number>();
  for (const l of codeLines(lines)) {
    const hit = EXT_SKILL.find(([re]) => re.test(l.file));
    if (hit) counts.set(hit[1], (counts.get(hit[1]) ?? 0) + 1);
  }
  const torch = codeLines(lines).some((l) => /\btorch\b/.test(l.text));
  if (torch) return "pytorch";
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}
