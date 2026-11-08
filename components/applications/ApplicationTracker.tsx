"use client";
// Application tracker page-ish component (UC-2). Drop onto any route; props: { userId }.
// Four states: loading / empty / error / success. Add + edit via a dialog; delete per row.
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Edit, Minus, Plus, RefreshCw, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, LoadingSkeleton, SkillChip } from "@/components/keystone";
import { cn } from "@/lib/utils";

// Initial form values, reset on open/cancel.
const initialForm: FormFields = {
  company: "",
  roleTitle: "",
  roleUrl: "",
  status: "applied",
  source: "",
  notes: "",
};

type Status = "applied" | "interviewing" | "offered" | "rejected" | "withdrawn";

interface Application {
  id: string;
  userId: string;
  company: string;
  roleTitle: string;
  roleUrl?: string | null;
  status: Status;
  appliedAt: string;
  source?: string | null;
  notes?: string | null;
  matchedSkills: string[];
  matchScore: number;
  createdAt: string;
  updatedAt: string;
}

type FormFields = {
  company: string;
  roleTitle: string;
  roleUrl: string;
  status: Status;
  source: string;
  notes: string;
};

const STATUS_ICON: Record<Status, { icon: React.ElementType; label: string; cls: string; iconCls: string }> = {
  applied: { icon: Send, label: "Applied", cls: "bg-status-degree/10 border-status-degree/35", iconCls: "text-status-degree" },
  interviewing: { icon: Clock, label: "Interviewing", cls: "bg-status-rising/12 border-status-rising/45", iconCls: "text-status-rising" },
  offered: { icon: CheckCircle2, label: "Offered", cls: "bg-status-proven/10 border-status-proven/35", iconCls: "text-status-proven" },
  rejected: { icon: X, label: "Rejected", cls: "bg-status-gap/10 border-status-gap/35", iconCls: "text-status-gap" },
  withdrawn: { icon: Minus, label: "Withdrawn", cls: "bg-muted border-border", iconCls: "text-muted-foreground" },
};

const STATUS_LABELS: Record<Status, string> = {
  applied: "Applied",
  interviewing: "Interviewing",
  offered: "Offered",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

function skillName(id: string) {
  return id.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

function appliedAtLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fetchApplications(userId: string): Promise<Application[]> {
  return fetch(`/api/applications?userId=${encodeURIComponent(userId)}`, { cache: "no-store" }).then(async (res) => {
    if (!res.ok) throw new Error("Failed to load your applications.");
    const json = await res.json();
    if (!json || !json.ok) throw new Error(json?.error?.message ?? "Failed to load your applications.");
    return (json.data ?? []) as Application[];
  });
}

function postApplication(body: FormFields): Promise<Application> {
  return fetch("/api/applications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      company: body.company,
      roleTitle: body.roleTitle,
      roleUrl: body.roleUrl || undefined,
      status: body.status,
      source: body.source || undefined,
      notes: body.notes || undefined,
    }),
  }).then(async (res) => {
    if (!res.ok) throw new Error("Couldn't save the application.");
    const json = await res.json();
    if (!json || !json.ok) throw new Error(json?.error?.message ?? "Couldn't save the application.");
    return json.data as Application;
  });
}

function patchApplication(id: string, userId: string, patches: Partial<Pick<FormFields, "status" | "notes">>): Promise<Application> {
  return fetch("/api/applications", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, userId, ...patches }),
  }).then(async (res) => {
    if (!res.ok) throw new Error("Couldn't update the application.");
    const json = await res.json();
    if (!json || !json.ok) throw new Error(json?.error?.message ?? "Couldn't update the application.");
    return json.data as Application;
  });
}

function deleteApplication(id: string, userId: string): Promise<void> {
  return fetch(`/api/applications?id=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId)}`, {
    method: "DELETE",
  }).then(async (res) => {
    if (!res.ok) throw new Error("Couldn't remove the application.");
  });
}

export default function ApplicationTracker({ userId }: { userId: string }) {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<FormFields>(() => ({ ...initialForm }));

  // Fetch on mount and whenever the user changes. No state setter runs synchronously
  // in the effect body: all updates land inside the fetch callbacks.
  useEffect(() => {
    let active = true;
    fetchApplications(userId)
      .then((items) => {
        if (!active) return;
        setApps(items.slice().sort((a, b) => Date.parse(b.appliedAt) - Date.parse(a.appliedAt)));
        setLoading(false);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError("That's on us, not you. Try again, or add an application manually.");
        setLoading(false);
      });
    return () => { active = false; };
  }, [userId]);

  const load = () => {
    setLoading(true);
    fetchApplications(userId)
      .then((items) => {
        setApps(items.slice().sort((a, b) => Date.parse(b.appliedAt) - Date.parse(a.appliedAt)));
        setLoading(false);
        setError(null);
      })
      .catch(() => {
        setError("That's on us, not you. Try again, or add an application manually.");
        setLoading(false);
      });
  };

  const resetForm = () => {
    setEditing(null);
    setForm({ ...initialForm });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = { ...form };
    const promise = editing
      ? patchApplication(editing.id, userId, { status: form.status, notes: form.notes || undefined })
      : postApplication(payload);
    promise
      .then(() => {
        toast(editing ? "Application updated." : "Application saved.");
        setOpen(false);
        resetForm();
        load();
      })
      .catch((err) => {
        toast(err.message || "That's on us, not you.");
        setSubmitting(false);
      });
  };

  const handleEdit = (app: Application) => {
    setEditing(app);
    setForm({
      company: app.company,
      roleTitle: app.roleTitle,
      roleUrl: app.roleUrl ?? "",
      status: app.status,
      source: app.source ?? "",
      notes: app.notes ?? "",
    });
    setOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Remove this application?")) return;
    deleteApplication(id, userId)
      .then(() => { toast("Application removed."); load(); })
      .catch(() => toast("Couldn't remove the application."));
  };

  const empty = apps.length === 0 && !loading && !error;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Application tracker</h2>
          <p className="text-sm text-muted-foreground">Save the jobs you&apos;re applying to and see which of your proven skills each one asks for.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger>
            <Button>
              <Plus className="mr-2 size-4" aria-hidden /> Add application
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit application" : "Add application"}</DialogTitle>
              <DialogDescription>
                Fill in the job details. Matched skills are worked out from your proven skills.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="roleTitle">Role</Label>
                  <Input id="roleTitle" required value={form.roleTitle} onChange={(e) => setForm({ ...form, roleTitle: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="roleUrl">Role URL (job ad)</Label>
                <Input id="roleUrl" type="url" placeholder="https://..." value={form.roleUrl} onChange={(e) => setForm({ ...form, roleUrl: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select id="status" value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source">Source</Label>
                  <Input id="source" placeholder="e.g. Adzuna, Reed" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" placeholder="Interview prep, contacts, next steps…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setOpen(false); resetForm(); }} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} aria-busy={submitting}>
                  {submitting ? <RefreshCw className="mr-2 size-4" aria-hidden /> : null}
                  {editing ? "Save changes" : "Save application"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <LoadingSkeleton variant="list" />
      ) : error ? (
        <ErrorState title="We couldn't load your applications" body={error} onRetry={load} />
      ) : empty ? (
        <EmptyState
          icon={Send}
          title="No applications yet"
          body="Save the jobs you're applying to so you can track their status and tailor your CV and interview prep to the skills each one asks for."
          action={
            <DialogTrigger>
              <Button>Add your first application</Button>
            </DialogTrigger>
          }
        />
      ) : (
        <section className="rounded-2xl border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-foreground">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="h-12 text-left font-medium text-muted-foreground" scope="col">Company</th>
                  <th className="h-12 text-left font-medium text-muted-foreground" scope="col">Role</th>
                  <th className="h-12 text-left font-medium text-muted-foreground" scope="col">Status</th>
                  <th className="h-12 text-left font-medium text-muted-foreground" scope="col">Applied</th>
                  <th className="h-12 text-left font-medium text-muted-foreground" scope="col">Matched skills</th>
                  <th className="h-12 text-right font-medium text-muted-foreground" scope="col">Match</th>
                  <th className="h-12 text-right" scope="col">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {apps.map((app) => {
                  const s = STATUS_ICON[app.status];
                  const Icon = s.icon;
                  const matchPct = Math.round(app.matchScore * 100);
                  return (
                    <tr key={app.id} className="group border-b border-border last:border-0">
                      <td className="h-10 px-4">{app.company}</td>
                      <td className="h-10 px-4">
                        {app.roleUrl ? (
                          <a href={app.roleUrl} target="_blank" rel="noopener" className={cn("text-primary underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", "group-hover:underline-offset-2")}>
                            {app.roleTitle}
                          </a>
                        ) : (
                          app.roleTitle
                        )}
                      </td>
                      <td className="h-10 px-4">
                        <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-medium whitespace-nowrap text-foreground", s.cls)}>
                          <Icon className={cn("size-3.5 shrink-0", s.iconCls)} aria-hidden /> {s.label}
                        </span>
                      </td>
                      <td className="h-10 px-4 text-muted-foreground">{appliedAtLabel(app.appliedAt)}</td>
                      <td className="h-10 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {app.matchedSkills.map((skillId) => (
                            <SkillChip key={skillId} skillId={skillId} name={skillName(skillId)} />
                          ))}
                          {app.matchedSkills.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="h-10 px-4 text-right">
                        <div className="flex items-end gap-2">
                          <span className="font-mono tabular-nums font-semibold">{matchPct}%</span>
                          <div className="w-16 h-1.5 bg-muted rounded-full shrink-0">
                            <div className="h-1.5 rounded-full bg-primary" style={{ width: matchPct + "%" }} />
                          </div>
                        </div>
                      </td>
                      <td className="h-10 px-4 text-right">
                        <Button size="icon-sm" variant="outline" onClick={() => handleEdit(app)} aria-label={`Edit ${app.company}`}>
                          <Edit className="size-3.5" aria-hidden />
                        </Button>
                        <Button size="icon-sm" variant="destructive" onClick={() => handleDelete(app.id)} aria-label={`Remove ${app.company}`}>
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
