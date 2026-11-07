// Static registry of every Keystone agent (contract §5 AgentName): what it does, what it reads and
// writes, the tools it may use, its guardrails, the human checkpoint and its fallback.
// Served by GET /api/agents/registry and shown on /governance. Pure data: safe on client and server.
// P5 entries mirror lib/agents/*.ts; P1–P4 entries come from docs/team/P1–P4 (owners: please keep yours current).
import type { CheckpointKind } from "@/lib/agents/harness";
import type { AgentName } from "@/lib/types";

export type AgentOwner = "P1" | "P2" | "P3" | "P4" | "P5";

export interface AgentRegistryEntry {
  agent: AgentName;
  name: string;
  role: string;
  inputs: string[];
  outputs: string[];
  tools: string[];
  guardrails: string[];
  /** The consequential step a person decides ("You decide"). */
  humanCheckpoint?: string;
  checkpointKind?: CheckpointKind;
  fallback: string;
  owner: AgentOwner;
}

export const AGENT_REGISTRY: AgentRegistryEntry[] = [
  {
    agent: "orchestrator", name: "Orchestrator", owner: "P2",
    role: "Runs the onboarding pipeline and keeps going when one agent fails.",
    inputs: ["userId"], outputs: ["runId", "Agent events (live stream)"],
    tools: ["Agent event stream (SSE)", "Document store"],
    guardrails: ["One failing agent never stops the run", "Per-step fallbacks", "Deterministic demo replay"],
    fallback: "Cached or fixture data for any step that fails",
  },
  {
    agent: "syllabus", name: "Syllabus Agent", owner: "P1",
    role: "Reads your programme's public module pages and extracts topics and learning outcomes.",
    inputs: ["Programme URL"], outputs: ["Programme (modules, topics, outcomes)"],
    tools: ["Firecrawl", "LLM (structured output)"],
    guardrails: ["Public pages only", "Schema-validated output"],
    fallback: "The committed University of Manchester programme cache",
  },
  {
    agent: "skillmap", name: "Skill Mapper", owner: "P1",
    role: "Maps module topics and job-ad text onto Keystone's skill taxonomy.",
    inputs: ["Module or ad text"], outputs: ["Skills with levels 0–3"],
    tools: ["Skill taxonomy (data/skills.json)", "LLM"],
    guardrails: ["Known skill ids only", "Unknown terms are reported, never invented"],
    fallback: "Alias matching without the LLM",
  },
  {
    agent: "market", name: "Market Agent", owner: "P1",
    role: "Counts which skills UK job ads ask for, per target role.",
    inputs: ["roleId", "location"], outputs: ["RoleDemand (share of ads per skill)"],
    tools: ["Adzuna", "Reed"],
    guardrails: ["Aggregates only, never individuals", "Every share comes with its sample size"],
    fallback: "The cached market snapshot",
  },
  {
    agent: "trends", name: "Trend Forecaster", owner: "P1",
    role: "Projects which skills are rising, from Hacker News 'Who is hiring' history.",
    inputs: ["Skill ids"], outputs: ["Trend series with a 12-month projection"],
    tools: ["HN Who is hiring archive"],
    guardrails: ["Forecasts carry low and high bands", "Labelled rising, stable or declining"],
    fallback: "The cached trend series",
  },
  {
    agent: "evidence", name: "Evidence Agent", owner: "P2",
    role: "Turns your public GitHub and LeetCode activity into skill evidence.",
    inputs: ["GitHub login", "LeetCode user"], outputs: ["Evidence items (skill, level, source link)"],
    tools: ["GitHub API", "LeetCode"],
    guardrails: ["Public data only", "Every claim links to its source", "Confidence score on each item"],
    humanCheckpoint: "You choose which accounts to connect", checkpointKind: "student-approval",
    fallback: "Fixture evidence",
  },
  {
    agent: "roadmap", name: "Roadmap Agent", owner: "P2",
    role: "Plans 12 weeks around your degree and exams, with a reason for every week.",
    inputs: ["Profile", "Bridge Map", "Programme", "Role demand"], outputs: ["Roadmap (12 weeks)"],
    tools: ["Deterministic planner", "LLM (wording only)"],
    guardrails: ["Every week has a Why? receipt", "Skips what your degree already teaches", "Lighter exam weeks"],
    humanCheckpoint: "You approve changes to your plan", checkpointKind: "student-approval",
    fallback: "Template wording for every week",
  },
  {
    agent: "matchmaker", name: "Matchmaker", owner: "P5",
    role: "Forms complementary study pods: each member learns what a podmate can teach.",
    inputs: ["Proven skills and gaps", "Interests", "Availability", "Tenure (new to uni)"], outputs: ["Pod with plain-English explanations"],
    tools: ["Deterministic scoring", "Embeddings (interests)", "LLM (explanation polish)"],
    guardrails: ["noDemographicSignals", "Inputs minimised before scoring", "Same input, same pod"],
    fallback: "The demo pod (demo mode)",
  },
  {
    agent: "architect", name: "Project Architect", owner: "P5",
    role: "Designs a 3-week pod project and opens a real GitHub repo with issues.",
    inputs: ["Pod (who learns and teaches what)"], outputs: ["Project brief, repo and issues"],
    tools: ["LLM", "GitHub (create repo and issues)", "n8n pod kickoff"],
    guardrails: ["noFullSolutions", "maxItems(8)", "Every member gets a learning issue", "Reviewer is never the assignee"],
    humanCheckpoint: "Each issue is reviewed and merged by a podmate, never by the AI", checkpointKind: "peer-approval",
    fallback: "A ready-made plan and the demo repo",
  },
  {
    agent: "techlead", name: "AI Tech Lead", owner: "P5",
    role: "Leaves Socratic review questions on pod pull requests.",
    inputs: ["Signed GitHub pull request event", "The diff (first 8,000 characters)"], outputs: ["One review comment"],
    tools: ["GitHub (read diff, comment)", "LLM"],
    guardrails: ["noFullSolutions", "Signed webhooks only", "Questions, not answers"],
    humanCheckpoint: "Your pod reviewer approves and merges, never the AI", checkpointKind: "peer-approval",
    fallback: "No comment is posted",
  },
  {
    agent: "trajectories", name: "Trajectories", owner: "P5",
    role: "Finds seniors whose journeys look like yours, for near-peer mentoring.",
    inputs: ["Interests", "Target role", "Year"], outputs: ["Similar journeys with a similarity score"],
    tools: ["Embeddings", "Shared journeys"],
    guardrails: ["maxItems(limit)", "Never shows you your own journey"],
    humanCheckpoint: "You decide whether to ask a senior for 15 minutes, and they decide whether to say yes", checkpointKind: "student-sends",
    fallback: "Word-overlap ranking",
  },
  {
    agent: "guides", name: "Guides", owner: "P5",
    role: "Finds Manchester practitioners for your top gap and drafts a first message.",
    inputs: ["Top gap skill", "Target role"], outputs: ["Up to 4 suggestions with draft messages"],
    tools: ["GitHub user search (read-only)", "Firecrawl web search", "LLM"],
    guardrails: ["noOutboundMessaging", "piiRedactor", "maxItems(4)", "3 drafts a day"],
    humanCheckpoint: "You decide whether to send it, from your own account", checkpointKind: "student-sends",
    fallback: "Template drafts",
  },
  {
    agent: "voice", name: "Voice", owner: "P4",
    role: "Runs mock interviews and voice onboarding, then gives kind, specific feedback.",
    inputs: ["Target role", "Your spoken answers"], outputs: ["Interview feedback (practice scores 1–5)"],
    tools: ["ElevenLabs Conversational AI", "Text-to-speech"],
    guardrails: ["Practice only: scores never count for credit", "Signed tool calls"],
    humanCheckpoint: "You start and stop every session", checkpointKind: "student-approval",
    fallback: "Text-mode interview",
  },
  {
    agent: "n8n", name: "Automations", owner: "P4",
    role: "Runs workflows: pod kickoff in Discord, the Monday audio briefing, the market refresh.",
    inputs: ["Workflow payload"], outputs: ["Triggered or not"],
    tools: ["n8n", "Discord"],
    guardrails: ["Shared-secret header on every call", "Credentials never exported"],
    humanCheckpoint: "The pod kickoff only runs when your pod presses Start project", checkpointKind: "student-approval",
    fallback: "Skipped quietly: the app works without it",
  },
];

export const CHECKPOINT_LABELS: Record<CheckpointKind, string> = {
  "peer-approval": "A podmate approves",
  "student-approval": "You approve",
  "lecturer-decision": "Your lecturer decides",
  "student-sends": "You send it",
};
