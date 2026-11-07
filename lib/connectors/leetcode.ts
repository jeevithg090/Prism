import "server-only";

export interface LeetCodeProfile { matchedUser?: { submitStatsGlobal?: { acSubmissionNum?: { difficulty: string; count: number }[] }; tagProblemCounts?: Record<string, { tagName: string; problemsSolved: number }[]> } }

export async function getLeetCodeProfile(username: string): Promise<LeetCodeProfile | null> {
  try {
    const response = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: "https://leetcode.com" },
      body: JSON.stringify({
        query: "query($u:String!){ matchedUser(username:$u){ submitStatsGlobal{ acSubmissionNum{ difficulty count } } tagProblemCounts{ advanced{ tagName problemsSolved } intermediate{ tagName problemsSolved } fundamental{ tagName problemsSolved } } } }",
        variables: { u: username },
      }),
      next: { revalidate: 86400 },
    });
    if (!response.ok) return null;
    const json = await response.json();
    return json?.data?.matchedUser ? json.data as LeetCodeProfile : null;
  } catch { return null; }
}
