"use client";
// The student's side: your proofs as leaves, pick what a link reveals, sign it (you decide), share it yourself.
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { Check, Copy, Download, ExternalLink, FileKey2, Link2, Link2Off, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, SectionCard } from "@/components/keystone";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, getJSON, sendJSON } from "@/components/challenge/api";
import { SOURCE_LABEL, type LadderSource } from "@/components/ladder/model";
import { shortHash, type IssueResult, type LedgerSkillView, type LedgerView, type ShareSummary } from "@/lib/labs/credential/model";
import { cn } from "@/lib/utils";
import { MerkleTree } from "./MerkleTree";

export const LEDGER_KEY = ["labs", "credential", "ledger"] as const;

const sourceLabel = (s: string) => SOURCE_LABEL[s as LadderSource] ?? s;

function IssueSkeleton() {
  return (
    <div role="status" aria-label="Hashing your proofs" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-3 rounded-2xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-6 w-48" />
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
      </div>
      <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}

function Rungs({ level }: { level: number }) {
  return (
    <span className="flex gap-1" aria-hidden>
      {[1, 2, 3].map((i) => <span key={i} className={cn("size-2.5 rounded-full", i <= level ? "bg-status-proven" : "border border-muted-foreground/40 bg-card")} />)}
    </span>
  );
}

function SkillRow({ skill, view, selected, onToggle }: { skill: LedgerSkillView; view: LedgerView; selected: boolean; onToggle: () => void }) {
  const leaves = skill.leafIndexes.map((i) => view.leaves[i]);
  const sources = [...new Set(leaves.map((l) => sourceLabel(l.source)))].join(", ");
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
          selected && "bg-primary/10 hover:bg-primary/15",
        )}
      >
        <span aria-hidden className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border-2", selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}>
          {selected && <Check className="size-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{skill.skillName}</span>
            <Rungs level={skill.level} />
            <span className="sr-only">Proof Ladder level {skill.level} of 3.</span>
          </span>
          <span className="mt-0.5 block truncate text-sm text-muted-foreground">
            {leaves.length} proof{leaves.length === 1 ? "" : "s"} from {sources}
          </span>
        </span>
      </button>
    </li>
  );
}

function absolute(url: string) {
  return typeof window === "undefined" ? url : `${window.location.origin}${url}`;
}

function ShareResult({ result, onOpen }: { result: IssueResult; onOpen: (shareUrl: string) => void }) {
  const reduce = useReducedMotion();
  const [copied, setCopied] = React.useState(false);
  const url = absolute(result.shareUrl);
  const ledger = result.credential.credentialSubject.evidenceLedger;
  const skills = [...new Set(result.share.disclosures.map((d) => d.leaf.skillName))];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied. Paste it into your application yourself.");
    } catch {
      toast.error("Your browser blocked copying. Select the link and copy it by hand.");
    }
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(result.share, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `keystone-credential-${ledger.sequence}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
      <SectionCard
        title="Your link is ready"
        description={`Credential #${ledger.sequence}${result.signedNew ? " was signed just now" : " already covered every proof, so it was reused"}. The link shows ${skills.join(", ")}: ${result.disclosed} proof${result.disclosed === 1 ? "" : "s"} revealed, ${result.hidden} kept hidden.`}
      >
        <div className="space-y-4" aria-live="polite">
          <label htmlFor="credential-link" className="sr-only">Your credential link</label>
          <input
            id="credential-link"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="h-11 w-full rounded-xl border bg-muted/60 px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap">
            <Button variant="outline" className="h-10 rounded-xl px-4" onClick={download}><Download aria-hidden />Download JSON</Button>
            <Button variant="outline" className="h-10 rounded-xl px-4" onClick={() => onOpen(result.shareUrl)}><ShieldCheck aria-hidden />Check it as an employer</Button>
            <Button variant="outline" className="h-10 rounded-xl px-4" onClick={copy}>{copied ? <Check aria-hidden /> : <Copy aria-hidden />}{copied ? "Copied" : "Copy link"}</Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Keystone never sends this anywhere. {ledger.previous ? <>It chains to your previous credential (digest <span className="font-mono">{shortHash(ledger.previous, 10)}</span>), so your history can&apos;t be quietly rewritten.</> : "It's the first link in your credential chain."}
          </p>
        </div>
      </SectionCard>
    </motion.div>
  );
}

function SharesList({ shares }: { shares: ShareSummary[] }) {
  const qc = useQueryClient();
  const revoke = useMutation({
    mutationFn: (id: string) => getJSONDelete(`/api/labs/credential/share/${id}`),
    onSuccess: () => { toast.success("Link revoked. Anyone who checks it now sees it's revoked."); void qc.invalidateQueries({ queryKey: LEDGER_KEY }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "We couldn't revoke that link."),
  });
  if (!shares.length) return null;
  return (
    <SectionCard title="Your links" description="Each link reveals only the skills you picked. Revoke one any time.">
      <ul className="divide-y">
        {shares.map((s) => (
          <li key={s.shareId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{s.skills.length} skill{s.skills.length === 1 ? "" : "s"} from credential #{s.sequence}</p>
              <p className="truncate text-sm text-muted-foreground">{s.revoked ? "Revoked" : s.skills.join(", ")}</p>
            </div>
            {s.revoked ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><Link2Off className="size-4" aria-hidden />Revoked</span>
            ) : (
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="outline" className="h-10 rounded-xl px-4" disabled={revoke.isPending} onClick={() => revoke.mutate(s.shareId)}>
                  <Link2Off aria-hidden />Revoke
                </Button>
                <Link href={s.url} className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-xl px-4")}><Link2 aria-hidden />Open</Link>
              </div>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

async function getJSONDelete(url: string): Promise<unknown> {
  const res = await fetch(url, { method: "DELETE" });
  const json = (await res.json().catch(() => null)) as { ok: boolean; data?: unknown; error?: { message: string } } | null;
  if (!json?.ok) throw new Error(json?.error?.message ?? "We couldn't reach Keystone.");
  return json.data;
}

export function IssuePanel({ onOpenShare }: { onOpenShare: (shareUrl: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: LEDGER_KEY, queryFn: () => getJSON<LedgerView>("/api/labs/credential"), retry: 1 });
  const [chosen, setChosen] = React.useState<string[] | null>(null);
  const [result, setResult] = React.useState<IssueResult | null>(null);
  const view = q.data;
  const selected = React.useMemo(() => chosen ?? (view?.skills.slice(0, 1).map((s) => s.skillId) ?? []), [chosen, view]);

  const issue = useMutation({
    mutationFn: (skillIds: string[]) => sendJSON<IssueResult>("/api/labs/credential", { skillIds, approved: true }),
    onSuccess: (r) => {
      setResult(r);
      toast.success(r.signedNew ? `Signed credential #${r.credential.credentialSubject.evidenceLedger.sequence}` : "Your newest credential still covers everything, so it was reused");
      void qc.invalidateQueries({ queryKey: LEDGER_KEY });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Signing failed. It's safe to try again."),
  });

  if (q.isPending) return <IssueSkeleton />;
  if (q.isError) {
    return <ErrorState title="We couldn't read your proofs" body={q.error instanceof Error ? q.error.message : "Keystone didn't answer."} onRetry={() => void q.refetch()} />;
  }
  if (!view?.leaves.length) {
    return (
      <EmptyState icon={FileKey2} title="No proofs to sign yet"
        body="A credential is built from your Proof Ladder. Pass a 20-minute micro-challenge and your first proof appears here."
        action={<Link href="/challenge" className={cn(buttonVariants(), "h-10 rounded-xl px-4")}>Try a micro-challenge</Link>} />
    );
  }

  const toggle = (id: string) => setChosen(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  const chosenSkills = view.skills.filter((s) => selected.includes(s.skillId));
  const chosenLeaves = chosenSkills.flatMap((s) => s.leafIndexes);
  const hidden = view.size - chosenLeaves.length;

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SectionCard
          title="Your proof ledger"
          description={`${view.size} proofs from your Proof Ladder across ${view.skills.length} skills, each hashed with its own salt. Pick the skills a link may reveal.`}
        >
          <ul aria-label="Skills you can reveal" className="space-y-1">
            {view.skills.map((s) => <SkillRow key={s.skillId} skill={s} view={view} selected={selected.includes(s.skillId)} onToggle={() => toggle(s.skillId)} />)}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            Missing a skill? Climb its rung first: <Link href="/challenge" className="underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">a micro-challenge</Link> or a merged pod PR adds a proof.
          </p>
        </SectionCard>

        <SectionCard
          className="lg:sticky lg:top-6 lg:self-start"
          title="What the link proves"
          description="Keystone signs only the root. Each revealed proof carries the hashes that lead back to it."
        >
          <MerkleTree tree={view.tree} size={view.size} chosen={chosenLeaves} root={view.root} />
          <div className="mt-6 space-y-3 rounded-xl bg-muted/60 p-4">
            <p className="font-medium">You decide</p>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {chosenSkills.length
                ? <>Anyone with the link sees {chosenSkills.map((s) => s.skillName).join(", ")} ({chosenLeaves.length} proof{chosenLeaves.length === 1 ? "" : "s"}) with links to the original work. Your other {hidden} proof{hidden === 1 ? "" : "s"} stay hidden.</>
                : "Pick at least one skill to reveal."}
            </p>
            <Button className="h-11 w-full rounded-xl px-4" disabled={!chosenSkills.length || issue.isPending} onClick={() => issue.mutate(chosenSkills.map((s) => s.skillId))}>
              <ShieldCheck aria-hidden />{issue.isPending ? "Signing…" : "Sign and create link"}
            </Button>
            <p className="text-sm text-muted-foreground">
              {view.latest
                ? <>Credential #{view.latest.sequence} {view.latest.current ? "covers every proof you have." : "is out of date: you've added proofs since, so signing makes a new one."}</>
                : "This will be your first credential."}{" "}
              Issuer key <a href="/api/labs/credential/jwks" target="_blank" rel="noreferrer" className="font-mono underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">{shortHash(view.issuer.did.replace("did:key:", ""), 10)}<ExternalLink className="ml-0.5 inline size-3.5" aria-hidden /><span className="sr-only"> (opens in a new tab)</span></a>
              {view.issuer.demoKey ? ", a demo key anyone can recompute." : "."}
            </p>
          </div>
        </SectionCard>
      </div>

      {result && <ShareResult result={result} onOpen={onOpenShare} />}
      <SharesList shares={view.shares} />
    </div>
  );
}
