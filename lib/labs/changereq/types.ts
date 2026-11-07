// Plan Change Requests: zod schemas and types (isomorphic, safe for the client).
// A change request is a pull request against the student's roadmap: hunks (week diffs), receipts, checks, risk.
import { z } from "zod";

export const CR_COLLECTION = "change_requests";
export const VERSIONS_COLLECTION = "plan_versions";

const Id = z.string().trim().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/i, "letters, numbers, - and _ only");
const RunIdZ = z.string().regex(/^run_[A-Za-z0-9_-]{4,40}$/);

export const SignalZ = z.object({
  skillId: z.string(),
  name: z.string(),
  /** Share of the role's ads, 0..100. */
  demandPct: z.number(),
  growthPerYear: z.number().optional(),
  label: z.enum(["rising", "stable", "declining"]).optional(),
  /** The Roadmap Agent's priority (demand × growth × degree factors), rounded to 3 dp. */
  priority: z.number(),
});
export type Signal = z.infer<typeof SignalZ>;

export const HunkZ = z.object({
  id: z.string(),
  /** reorder = two planned weeks trade places; swap-in = an unplanned skill replaces a planned one. */
  kind: z.enum(["reorder", "swap-in"]),
  week: z.number().int().min(1),
  startDate: z.string(),
  /** reorder only: the later week the incoming skill comes from (the outgoing skill moves there). */
  otherWeek: z.number().int().min(1).optional(),
  outgoing: z.object({ before: SignalZ, after: SignalZ }),
  incoming: z.object({ before: SignalZ, after: SignalZ }),
  weeksSooner: z.number().int().optional(),
  receipt: z.string().min(1),
});
export type Hunk = z.infer<typeof HunkZ>;

export const CheckZ = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["pass", "warn", "fail"]),
  detail: z.string(),
});
export type Check = z.infer<typeof CheckZ>;

export const CommentZ = z.object({
  id: z.string(),
  author: z.enum(["student", "roadmap"]),
  text: z.string(),
  ts: z.string(),
  flagged: z.boolean().optional(),
});
export type CrComment = z.infer<typeof CommentZ>;

export const RefreshInfoZ = z.object({
  id: z.string(),
  label: z.string(),
  month: z.string(),
  simulated: z.boolean(),
  adsAnalysed: z.number(),
  seriesRefit: z.number(),
  monthsFit: z.number(),
  movers: z.array(z.object({ skillId: z.string(), name: z.string(), growthBefore: z.number(), growthAfter: z.number(), demandBefore: z.number(), demandAfter: z.number() })),
});
export type RefreshInfo = z.infer<typeof RefreshInfoZ>;

export const CrStatusZ = z.enum(["open", "approved", "rejected", "reverted", "closed", "superseded"]);
export type CrStatus = z.infer<typeof CrStatusZ>;

export const ChangeRequestZ = z.object({
  id: z.string(),
  number: z.number().int().min(1),
  userId: z.string(),
  roleId: z.string(),
  title: z.string(),
  status: CrStatusZ,
  baseVersion: z.number().int().min(1),
  refresh: RefreshInfoZ,
  hunks: z.array(HunkZ),
  checks: z.array(CheckZ),
  risk: z.enum(["low", "medium", "high"]),
  readiness: z.object({ before: z.number(), after: z.number() }),
  comments: z.array(CommentZ),
  createdAt: z.string(),
  decidedAt: z.string().optional(),
  resultVersion: z.number().int().optional(),
  runId: z.string().optional(),
});
export type ChangeRequest = z.infer<typeof ChangeRequestZ>;

export interface PlanVersionSummary {
  version: number;
  cause: "base" | "change-request" | "revert";
  summary: string;
  createdAt: string;
  changeRequestNumber?: number;
  current: boolean;
}

export interface PlanWeekRow {
  week: number;
  startDate: string;
  skillId: string;
  name: string;
  hours: number;
  isExamWeek: boolean;
  locked: boolean;
}

export interface ChangeReqState {
  userId: string;
  roleId: string;
  roleName: string;
  version: number;
  weeks: PlanWeekRow[];
  open: ChangeRequest | null;
  history: Pick<ChangeRequest, "id" | "number" | "title" | "status" | "createdAt" | "decidedAt" | "resultVersion">[];
  versions: PlanVersionSummary[];
  demo: boolean;
}

// ---------- requests ----------
export const StateQueryZ = z.object({ userId: Id });
export const ActionReqZ = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh"), userId: Id, runId: RunIdZ.optional() }),
  z.object({ action: z.literal("approve"), userId: Id, id: Id, runId: RunIdZ.optional() }),
  z.object({ action: z.literal("reject"), userId: Id, id: Id, reason: z.string().trim().max(500).optional(), runId: RunIdZ.optional() }),
  z.object({ action: z.literal("comment"), userId: Id, id: Id, text: z.string().trim().min(1).max(500), runId: RunIdZ.optional() }),
  z.object({ action: z.literal("revert"), userId: Id, toVersion: z.number().int().min(1), runId: RunIdZ.optional() }),
]);
export type ActionReq = z.infer<typeof ActionReqZ>;
