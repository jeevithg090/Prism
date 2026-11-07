import type { AgentName } from "@/lib/types";

export type Pillar = "learning" | "assessment" | "teaching";

/** A Keystone Labs feature, listed on /labs and linked from the screens it connects to. */
export interface LabFeature {
  key: string;
  title: string;
  href: string;
  /** One plain sentence: what it does for the student or lecturer. */
  summary: string;
  pillar: Pillar;
  /** Existing Keystone parts it reads from or writes back to, e.g. ["Bridge Map", "Roadmap Agent", "Proof Ladder"]. */
  connects: string[];
  agent: AgentName;
  /** lucide-react icon name, e.g. "GitBranch". */
  icon: string;
}
