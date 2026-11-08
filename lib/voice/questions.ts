// P4 · Practice-mode interview script (no ElevenLabs key): 4 questions built from the interview's
// dynamicVariables, so the interviewer always asks about the PR you just merged (Proof Ladder rung 3).
// Pure and shared by the browser (Practice mode) and the server (tests, ElevenLabs agent prompt notes).

export type DynamicVariables = Record<string, string>;

export const PRACTICE_QUESTION_COUNT = 4;

const v = (vars: DynamicVariables, key: string, fallback: string) => (vars[key]?.trim() ? vars[key].trim() : fallback);

export function practiceQuestions(vars: DynamicVariables): string[] {
  const name = v(vars, "name", "there");
  const pr = v(vars, "pr_title", "Containerise the captioning API with Docker");
  const project = v(vars, "project_title", "your pod project");
  const skill = v(vars, "pr_skill", "Docker");
  const reviewer = v(vars, "reviewer", "your reviewer");
  const role = v(vars, "role", "ML engineer");
  const focus = v(vars, "week_focus", skill);
  const merged = vars.pr_status === "merged";
  const short = project.split(":")[0].trim() || project;
  return [
    merged
      ? `Hi ${name}. Walk me through the pull request you merged, "${pr}". What did you build, and why does ${short} need it?`
      : `Hi ${name}. Tell me about your pod issue, "${pr}". What are you building, and why does ${short} need it?`,
    `Explain ${skill} to a first-year who has never used it. What problem does it solve in your project?`,
    `What was the hardest part of that work, and what feedback did ${reviewer} give you in review?`,
    `You're aiming for ${role} roles, and this week you're focusing on ${focus}. How are you learning it, and how will you prove it?`,
  ];
}

/** Demo answers for [Use sample answer]: realistic, a little hesitant, about the merged Docker PR. */
export function sampleAnswers(vars: DynamicVariables): string[] {
  const skill = v(vars, "pr_skill", "Docker");
  const reviewer = v(vars, "reviewer", "Priya");
  const focus = v(vars, "week_focus", skill);
  const pod = v(vars, "pod_name", "our pod");
  const project = v(vars, "project_title", "our pod project");
  const pr = v(vars, "pr_title", "Containerise the captioning API with Docker");
  if ((vars.pr_skill_id ?? "docker") === "docker") {
    return [
      `In ${pod} we're building ${project}, an image captioning API for screen-reader users. My issue was to containerise the API with Docker. I wrote the Dockerfile from a slim Python base image, um, installed the requirements and copied the code in. As a result anyone in the pod can start the API with one docker run command, and it works the same on every laptop.`,
      `Docker packages your app and everything it needs into an image, sort of like a recipe. When you run the image you get a container, which is an isolated process with its own file system. In our project it means the Python version, the model and the libraries are always the same, so, like, we stopped getting works-on-my-machine bugs.`,
      `The hardest part was that the build was really slow. Um, every small change reinstalled all the packages. ${reviewer} asked me in her review what happens to layer caching when COPY comes before pip install. I moved the requirements file and pip install above the COPY of the code, so the dependency layer is cached. Builds went from about four minutes to twenty seconds, and she approved the merge.`,
      `This week I'm focusing on ${focus}. I'm, you know, doing the official tutorial in short sessions, then I use it straight away in our pod project, because a reviewer checks real code. I think the merged pull request is my proof, and I learned that asking for review early saves me a lot of time.`,
    ];
  }
  return [
    `In ${pod} we're building ${project}. My issue was "${pr}". I wrote the first version, um, tested it with my reviewer and fixed the edge cases. As a result the feature works end to end and the pod can build on it.`,
    `${skill} is a tool that solves a specific problem in our project. I'd explain it with an example: I used it to make our code easier to run and test, so, like, everyone gets the same result.`,
    `The hardest part was understanding why my first approach failed. ${reviewer} asked me a question in review instead of giving me the answer, so I tried a smaller version, found the bug and changed my design. It worked, and the PR was merged.`,
    `This week I'm focusing on ${focus}. I'm, you know, following a short tutorial and then using it in our pod project, because real code that someone reviews is the best proof.`,
  ];
}

export type TranscriptTurn = { speaker: "ai" | "user"; text: string };

/** `ai:` / `user:` lines, the transcript format scoring expects. */
export function formatTranscript(turns: TranscriptTurn[]): string {
  return turns.filter((t) => t.text.trim()).map((t) => `${t.speaker}: ${t.text.replace(/\s+/g, " ").trim()}`).join("\n");
}

/** Spoken time estimate (≈150 words a minute) for typed answers, so filler rates stay meaningful. */
export function estimateDurationSec(turns: TranscriptTurn[]): number {
  const words = turns.reduce((n, t) => n + (t.text.match(/\S+/g)?.length ?? 0), 0);
  return Math.max(30, Math.round((words / 150) * 60));
}
