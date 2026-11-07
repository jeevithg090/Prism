import "server-only";
import { Octokit } from "octokit";

export interface GithubRepo { name: string; full_name: string; html_url: string; default_branch: string; pushed_at: string | null }
export interface GithubFile { repo: string; path: string; branch: string; text: string; url: string }
export interface GithubCommit { repo: string; sha: string; patches: string[] }
export interface GithubProfile { user: { login: string; html_url: string }; repos: GithubRepo[]; languages: { repo: GithubRepo; languages: Record<string, number> }[]; readmes: { repo: GithubRepo; text: string }[]; files: GithubFile[]; filePaths: { repo: string; path: string }[]; commits: GithubCommit[]; rateLimitLow: boolean }

const SOURCE = /\.(py|ts|tsx|js|java|ipynb|sql|go|rs|c|cpp)$/i;
const PREFERRED = /(main|app|model|train|index)/i;

export async function getGithubProfile(login: string): Promise<GithubProfile> {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const { data: user, headers } = await octokit.rest.users.getByUsername({ username: login });
  const response = await octokit.rest.repos.listForUser({ username: login, sort: "pushed", per_page: 30 });
  const repos = response.data.filter((repo) => !repo.fork).sort((a, b) => (b.pushed_at ?? "").localeCompare(a.pushed_at ?? "")).slice(0, 8) as GithubRepo[];
  const rateLimitLow = Number(headers["x-ratelimit-remaining"] ?? response.headers["x-ratelimit-remaining"] ?? 500) < 20;
  const languages: GithubProfile["languages"] = [];
  const readmes: GithubProfile["readmes"] = [];
  for (const repo of repos) {
    const [owner, name] = repo.full_name.split("/");
    const [langResult, readmeResult] = await Promise.allSettled([
      octokit.rest.repos.listLanguages({ owner, repo: name }),
      octokit.rest.repos.getReadme({ owner, repo: name }),
    ]);
    if (langResult.status === "fulfilled") languages.push({ repo, languages: langResult.value.data });
    if (readmeResult.status === "fulfilled") {
      const encoded = readmeResult.value.data.content ?? "";
      readmes.push({ repo, text: Buffer.from(encoded, "base64").toString("utf8").slice(0, 3000) });
    }
  }

  const files: GithubProfile["files"] = [];
  const filePaths: GithubProfile["filePaths"] = [];
  const trees: { repo: GithubRepo; paths: { path: string; size?: number; type?: string }[] }[] = [];
  if (!rateLimitLow) {
    for (const repo of repos.slice(0, 3)) {
      const [owner, name] = repo.full_name.split("/");
      try {
        const tree = await octokit.rest.git.getTree({ owner, repo: name, tree_sha: repo.default_branch, recursive: "1" });
        const entries = tree.data.tree.filter((x) => x.type === "blob" && x.path && SOURCE.test(x.path) && (x.size ?? 0) < 30_000);
        trees.push({ repo, paths: entries.map((x) => ({ path: x.path!, size: x.size, type: x.type })) });
        filePaths.push(...tree.data.tree.filter((x) => x.type === "blob" && x.path).map((x) => ({ repo: repo.name, path: x.path! })));
      } catch { /* a private or empty repository should not hide public repositories */ }
    }
    const candidates = trees.flatMap(({ repo, paths }) => paths.map((file) => ({ repo, file })))
      .sort((a, b) => Number(PREFERRED.test(b.file.path)) - Number(PREFERRED.test(a.file.path)));
    for (const { repo, file } of candidates.slice(0, 5)) {
      const [owner, name] = repo.full_name.split("/");
      try {
        const res = await octokit.rest.repos.getContent({ owner, repo: name, path: file.path });
        const item = Array.isArray(res.data) ? undefined : res.data;
        if (!item || item.type !== "file" || !("content" in item)) continue;
        const text = Buffer.from(item.content, "base64").toString("utf8").split(/\r?\n/).slice(0, 200).join("\n");
        files.push({ repo: repo.name, path: file.path, branch: repo.default_branch, text, url: `${repo.html_url}/blob/${repo.default_branch}/${file.path}` });
      } catch { /* skip unreadable file */ }
    }
  }
  const commits: GithubProfile["commits"] = [];
  if (!rateLimitLow) for (const repo of repos.slice(0, 2)) {
    const [owner, name] = repo.full_name.split("/");
    try {
      const list = await octokit.rest.repos.listCommits({ owner, repo: name, author: login, per_page: 5 });
      const patches: string[] = [];
      for (const commit of list.data) {
        try {
          const detail = await octokit.rest.repos.getCommit({ owner, repo: name, ref: commit.sha });
          patches.push(...(detail.data.files ?? []).map((f) => f.patch).filter((p): p is string => !!p).map((p) => p.slice(0, 1500)));
        } catch { /* commit detail may be unavailable */ }
      }
      if (list.data.length) commits.push({ repo: repo.name, sha: list.data[0].sha, patches });
    } catch { /* skip repositories with inaccessible commit history */ }
  }
  return { user, repos, languages, readmes, files, filePaths, commits, rateLimitLow };
}
