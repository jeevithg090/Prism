"use client";
// The employer's side: open a link or paste a credential, see every check, and try to fake it.
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, CheckCircle2, ExternalLink, EyeOff, RotateCcw, ShieldCheck, ShieldX, Wand2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, SectionCard } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, getJSON, sendJSON } from "@/components/challenge/api";
import { SOURCE_LABEL, type LadderSource } from "@/components/ladder/model";
import { shortHash, type SkillShare, type VerificationReport, type VerifiedSkill } from "@/lib/labs/credential/model";
import { cn } from "@/lib/utils";

const sourceLabel = (s: string) => SOURCE_LABEL[s as LadderSource] ?? s;

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

type Tamper = "rung" | "root";

function tampered(text: string, kind: Tamper): string | null {
  try {
    const doc = JSON.parse(text) as SkillShare;
    if (kind === "rung") {
      const d = doc.disclosures?.[0];
      if (!d) return null;
      d.leaf.rung = 3;
      d.leaf.rungLabel = "Can teach it";
      d.leaf.quote = `${d.leaf.quote} (and taught it to the whole cohort)`;
    } else {
      const l = doc.credential?.credentialSubject?.evidenceLedger;
      if (!l) return null;
      l.root = `${l.root.slice(1)}${l.root[0] === "0" ? "1" : "0"}`;
    }
    return JSON.stringify(doc, null, 2);
  } catch {
    return null;
  }
}

function Verdict({ report }: { report: VerificationReport }) {
  const valid = report.verdict === "valid";
  const Icon = valid ? ShieldCheck : ShieldX;
  return (
    <div role="status" aria-live="polite" className={cn("flex items-start gap-4 rounded-xl border p-4", valid ? "border-status-proven/30 bg-status-proven/10" : "border-status-gap/30 bg-status-gap/10")}>
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full bg-card", valid ? "text-status-proven" : "text-status-gap")}>
        <Icon className="size-6" aria-hidden />
      </span>
      <div className="min-w-0 space-y-1">
        <p className="text-xl font-semibold tracking-tight">{valid ? "Verified" : "Not valid"}</p>
        <p className="text-foreground">{report.headline.replace(/^Not valid\. /, "")}</p>
        {report.subject && (
          <p className="text-sm text-muted-foreground">{report.subject.name}, {report.subject.programme}</p>
        )}
      </div>
    </div>
  );
}

function SkillProofs({ skill }: { skill: VerifiedSkill }) {
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-lg font-semibold">{skill.skillName}</p>
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-medium text-foreground", skill.ok ? "border-status-proven/30 bg-status-proven/10" : "border-status-gap/30 bg-status-gap/10")}>
          {skill.ok ? <CheckCircle2 className="size-4 text-status-proven" aria-hidden /> : <XCircle className="size-4 text-status-gap" aria-hidden />}
          {skill.ok ? `Proven to rung ${skill.level} of 3` : "A proof doesn't check out"}
        </span>
      </div>
      <ul className="mt-3 space-y-3">
        {skill.proofs.map((p) => (
          <li key={p.index} className="rounded-xl bg-muted/60 p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">{p.rungLabel}</span>
              <span className="text-sm text-muted-foreground">{sourceLabel(p.source)}{formatDate(p.createdAt) ? `, ${formatDate(p.createdAt)}` : ""}</span>
            </div>
            <p className="mt-1 text-foreground">{p.quote}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5 text-foreground">
                {p.ok ? <CheckCircle2 className="size-4 text-status-proven" aria-hidden /> : <XCircle className="size-4 text-status-gap" aria-hidden />}
                {p.ok ? `Merkle proof: ${p.pathLength} hash${p.pathLength === 1 ? "" : "es"} to the signed root` : p.reason}
              </span>
              {p.url && /^https?:\/\//.test(p.url) && (
                <a href={p.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Original evidence<ExternalLink className="size-3.5" aria-hidden /><span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
              {p.injection === "high" && (
                <span className="inline-flex items-center gap-1.5"><AlertTriangle className="size-4 text-status-rising" aria-hidden />This text tries to instruct an AI</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </li>
  );
}

function Report({ report }: { report: VerificationReport }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className="space-y-6" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
      <Verdict report={report} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <h3 className="mb-2 font-semibold">Checks</h3>
          <ul className="divide-y">
            {report.checks.map((c) => {
              const warn = c.id === "injection";
              return (
                <li key={c.id} className="flex items-start gap-3 py-3">
                  {c.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-status-proven" aria-hidden />
                    : warn ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-status-rising" aria-hidden />
                      : <XCircle className="mt-0.5 size-5 shrink-0 text-status-gap" aria-hidden />}
                  <div className="min-w-0">
                    <p className="font-medium">{c.label}<span className="sr-only">{c.ok ? ": passed" : warn ? ": warning" : ": failed"}</span></p>
                    <p className="text-sm text-muted-foreground">{c.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          {report.ledger && (
            <p className="mt-3 text-sm text-muted-foreground">
              Credential #{report.ledger.sequence}, root <span className="font-mono text-foreground">{shortHash(report.ledger.root, 12)}</span>
              {report.issuer ? <>, signed by <span className="font-mono text-foreground">{shortHash(report.issuer.did.replace("did:key:", ""), 10)}</span></> : null}.
            </p>
          )}
        </div>
        <div>
          <h3 className="mb-2 font-semibold">Disclosed skills</h3>
          {report.skills.length ? (
            <ul className="divide-y">{report.skills.map((s) => <SkillProofs key={s.skillId} skill={s} />)}</ul>
          ) : (
            <p className="text-muted-foreground">This credential discloses no skills. The signature only vouches for the tree&apos;s root.</p>
          )}
          {report.hidden > 0 && (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <EyeOff className="size-4" aria-hidden />
              {report.hidden} of {report.disclosed + report.hidden} proofs are hidden by the student. You see only their hashes, never their content.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function VerifyPanel({ shareId }: { shareId: string | null }) {
  const [text, setText] = React.useState("");
  const [original, setOriginal] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<VerificationReport | null>(null);
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null);

  // Opening a link: fetch what it reveals and check it straight away.
  const shared = useQuery({
    queryKey: ["labs", "credential", "share", shareId],
    enabled: !!shareId,
    retry: false,
    queryFn: async () => {
      const share = await getJSON<SkillShare>(`/api/labs/credential/share/${encodeURIComponent(shareId as string)}`);
      const json = JSON.stringify(share, null, 2);
      return { json, report: await sendJSON<VerificationReport>("/api/labs/credential/verify", { document: json }) };
    },
  });
  if (shared.data && loadedFor !== shareId) {
    setLoadedFor(shareId);
    setText(shared.data.json);
    setOriginal(shared.data.json);
    setReport(shared.data.report);
  }

  const verify = useMutation({
    mutationFn: (doc: string) => sendJSON<VerificationReport>("/api/labs/credential/verify", { document: doc }),
    onSuccess: (r) => setReport(r),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "We couldn't check that credential."),
  });
  const { mutate } = verify;
  const loading = !!shareId && shared.isPending;
  const loadError = shareId && shared.isError ? (shared.error instanceof Error ? shared.error.message : "We couldn't open that link.") : null;

  const fake = (kind: Tamper) => {
    const next = tampered(text, kind);
    if (!next) { toast.error("Paste or open a credential with a disclosed proof first."); return; }
    setText(next);
    mutate(next);
  };
  const restore = () => {
    if (!original) return;
    setText(original);
    mutate(original);
  };

  const busy = verify.isPending;
  const tamperBar = original ? (
    <div className="mb-6 flex flex-col gap-3 rounded-xl bg-muted/60 p-4 md:flex-row md:items-center md:justify-between">
      <p className="text-sm text-muted-foreground">Try to fake it: change one detail and check again.</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="outline" className="h-10 rounded-xl px-4" onClick={restore} disabled={busy}><RotateCcw aria-hidden />Restore the original</Button>
        <Button variant="outline" className="h-10 rounded-xl px-4" onClick={() => fake("root")} disabled={busy}><Wand2 aria-hidden />Edit the signed root</Button>
        <Button variant="outline" className="h-10 rounded-xl px-4" onClick={() => fake("rung")} disabled={busy}><Wand2 aria-hidden />Upgrade a proof to Can teach it</Button>
      </div>
    </div>
  ) : null;

  const editor = (
    <SectionCard
      key="editor"
      title={report ? "The credential JSON" : "Check a credential"}
      description="Paste the JSON a student sent you, or open their link. The check needs nothing from the student and can't be talked round: it's arithmetic."
    >
      <div className="space-y-3">
        <label htmlFor="credential-json" className="font-medium">Credential JSON</label>
        <Textarea
          id="credential-json"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder='{ "type": "KeystoneSkillShare", "credential": { … }, "disclosures": [ … ] }'
          className="h-56 max-h-56 min-h-40 overflow-auto rounded-xl font-mono text-sm [field-sizing:fixed]"
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant={report ? "outline" : "default"} className="h-10 rounded-xl px-4" onClick={() => mutate(text)} disabled={!text.trim() || busy}>
            <ShieldCheck aria-hidden />{busy ? "Checking…" : "Verify"}
          </Button>
        </div>
      </div>
    </SectionCard>
  );

  const result = (
    <section key="result" aria-label="Verification result" aria-busy={busy || loading}>
      {loading || (busy && !report) ? (
        <div role="status" aria-label="Checking the credential" className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
          <Skeleton className="h-20 w-full rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-48 rounded-xl" /><Skeleton className="h-48 rounded-xl" /></div>
        </div>
      ) : loadError ? (
        <ErrorState title="We couldn't open that link" body={loadError} onRetry={() => void shared.refetch()} />
      ) : verify.isError && !report ? (
        <ErrorState title="The check didn't run" body="Keystone didn't answer. Your pasted credential is still here." onRetry={() => mutate(text)} />
      ) : report ? (
        <SectionCard className={cn("transition-opacity motion-reduce:transition-none", busy && "opacity-60")}>
          {tamperBar}
          <Report report={report} />
        </SectionCard>
      ) : (
        <EmptyState icon={ShieldCheck} title="Nothing checked yet"
          body="Open a student's credential link or paste its JSON above. You'll see the signature, the issuer key, the dates and a Merkle proof for every skill it reveals." />
      )}
    </section>
  );

  return <div className="space-y-8">{report || loading ? [result, editor] : [editor, result]}</div>;
}
