"use client";
// UC-4 · CapstoneRoadmap: a solo capstone milestone roadmap with a "ready to showcase" checklist.
// Four states: LoadingSkeleton / EmptyState / ErrorState / success. Keyboard reachable, focus rings, aria-labels.
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader, EmptyState, ErrorState, LoadingSkeleton } from "@/components/keystone";
import { cn } from "@/lib/utils";
import type { CapstoneProject } from "@/lib/schemas/capstone";

const STATUS_BADGE: Record<CapstoneProject["status"], { variant: "default" | "outline"; label: string }> = {
  planning: { variant: "outline", label: "Planning" },
  "in-progress": { variant: "default", label: "In progress" },
  showcasing: { variant: "outline", label: "Showcasing" },
  completed: { variant: "default", label: "Completed" },
};

function progressOf(project: CapstoneProject): { done: number; total: number; pct: number } {
  const total = project.milestones.length;
  const done = project.milestones.filter((m) => m.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, pct };
}

async function fetchProjects(userId: string): Promise<CapstoneProject[]> {
  const res = await fetch(`/api/projects/portfolio?userId=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error((json as { error?: { message?: string } })?.error?.message ?? "Could not load your capstone projects.");
  }
  return Array.isArray(json.data) ? (json.data as CapstoneProject[]) : [];
}

export function CapstoneRoadmap({ userId, roleId }: { userId: string; roleId?: string }) {
  const [open, setOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPitch, setNewPitch] = useState("");
  const [saving, setSaving] = useState(false);
  const [showcaseEdits, setShowcaseEdits] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["capstones", userId],
    queryFn: () => fetchProjects(userId),
    enabled: !!userId,
  });
  const queryClient = useQueryClient();

  const projects: CapstoneProject[] | undefined = query.data;
  const isPending = query.isPending;
  const queryError = query.error;

  if (isPending) return <LoadingSkeleton variant="list" />;
  if (queryError) return (
    <ErrorState
      title="We could not load your capstone projects"
      body="Try again in a moment."
      onRetry={() => void query.refetch()}
      onUseDemo={() => {
        toast("Showing an empty roadmap — create your first project below.");
      }}
    />
  );
  const list = projects ?? [];
  if (list.length === 0) {
    return (
      <EmptyState
        title="No capstone projects yet"
        body="Your first capstone project turns your biggest skill gaps into a milestone roadmap you can link from your CV and LinkedIn."
        action={
          <Button onClick={() => setOpen(true)} size="lg">
            <Plus aria-hidden /> New project
          </Button>
        }
      />
    );
  }

  const handleUpdate = async (project: CapstoneProject, patches: Partial<{
    title: string;
    pitch: string;
    status: CapstoneProject["status"];
    showcaseUrl: string;
  }>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/projects/portfolio", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: project.id, userId, ...patches }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message ?? "Update failed.");
      queryClient.setQueryData<CapstoneProject[]>(["capstones", userId], (cur: CapstoneProject[] | undefined) =>
        (cur ?? []).map((p) => (p.id === project.id ? (json.data as CapstoneProject) : p)),
      );
      toast("Saved");
    } catch {
      toast.error("We could not save that change. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (projectId: string, milestoneId: string, done: boolean) => {
    try {
      const res = await fetch("/api/projects/portfolio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: projectId, userId, milestoneId, done }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error("Toggle failed.");
      queryClient.setQueryData<CapstoneProject[]>(["capstones", userId], (cur: CapstoneProject[] | undefined) =>
        (cur ?? []).map((p) => {
          if (p.id !== projectId) return p;
          return {
            ...p,
            milestones: p.milestones.map((m) =>
              m.id === milestoneId ? { ...m, done } : m,
            ),
            updatedAt: new Date().toISOString(),
          };
        }),
      );
    } catch {
      toast.error("We could not update that task. Try again.");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/projects/portfolio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId,
          title: newTitle.trim(),
          pitch: newPitch.trim() || undefined,
          ...(roleId ? { roleId } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message ?? "Create failed.");
      queryClient.setQueryData<CapstoneProject[]>(["capstones", userId], (cur: CapstoneProject[] | undefined) => [
        (json.data as CapstoneProject),
        ...(cur ?? []),
      ]);
      setNewTitle("");
      setNewPitch("");
      setOpen(false);
      toast("Project created");
    } catch {
      toast.error("We could not create the project. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleShowcaseSave = async (project: CapstoneProject) => {
    const url = showcaseEdits[project.id];
    if (!url) return;
    try {
      new URL(url);
    } catch {
      toast.error("That does not look like a valid URL.");
      return;
    }
    await handleUpdate(project, { showcaseUrl: url });
    setShowcaseEdits((cur) => { const n = { ...cur }; delete n[project.id]; return n; });
  };

  return (
    <div className="space-y-8 pb-24">
      <PageHeader
        title="Your capstone roadmap"
        subtitle="Turn your biggest skill gaps into a milestone roadmap — build, then showcase it to employers."
        actions={
          <Button onClick={() => setOpen(true)} size="lg">
            <Plus aria-hidden /> New project
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
        {list.map((project) => {
          const { done, total, pct } = progressOf(project);
          const badge = STATUS_BADGE[project.status];
          return (
            <Card key={project.id} className="flex flex-col h-full">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{project.title}</CardTitle>
                  <Badge variant={badge.variant} className="text-xs">
                    {badge.label}
                  </Badge>
                </div>
                <CardDescription>{project.pitch}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {project.targetSkills.map((skillId) => (
                    <span key={skillId} data-skill={skillId} className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 py-1 text-sm text-foreground">
                      <span className="sr-only">Skill: {skillId}</span>
                      {skillId.charAt(0).toUpperCase() + skillId.slice(1)}
                    </span>
                  ))}
                </div>
                <div className="space-y-2">
                  {project.milestones.map((m) => {
                    const mpct = m.tasks.length === 0 ? 0 : (m.done ? 100 : 0);
                    return (
                      <Card key={m.id} className="border bg-muted/50 p-3">
                        <CardHeader className="pb-1">
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-sm font-semibold">{m.title}</CardTitle>
                            <Badge variant="outline" className="text-xs">{mpct}%</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="py-2">
                          <div className="space-y-1.5">
                            {m.tasks.map((t, ti) => (
                              <div key={ti} role="listitem" className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={m.done}
                                  onChange={() => void handleToggle(project.id, m.id, !m.done)}
                                  aria-label={`${m.title}: ${t}`}
                                  className="shrink-0 rounded-lg border border-input bg-card text-primary transition-all duration-200 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                                  disabled={saving}
                                />
                                <span
                                  className={cn("text-sm text-foreground leading-snug", m.done && "line-through text-muted-foreground")}
                                >
                                  {t}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Progress value={mpct} className="h-3 w-24 shrink-0" />
                            <span className="text-xs text-muted-foreground">{m.title}</span>
                            <span className="ml-auto text-xs text-muted-foreground tabular-nums">{mpct}%</span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
              <CardFooter className="pt-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-mono text-foreground tabular-nums">{pct}%</span>
                  <span className="text-xs text-muted-foreground">{done} of {total} milestones</span>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <Input
                    id={`showcase-${project.id}`}
                    placeholder="https://your-project.com"
                    value={showcaseEdits[project.id] ?? project.showcaseUrl ?? ""}
                    onChange={(e) => setShowcaseEdits((cur) => ({ ...cur, [project.id]: e.target.value }))}
                    disabled={saving}
                    className="text-xs md:text-sm"
                    aria-label={`Showcase URL for ${project.title}`}
                  />
                  <Button
                    onClick={() => void handleShowcaseSave(project)}
                    disabled={saving || !showcaseEdits[project.id]}
                    size="icon-sm"
                    aria-label={`Save showcase URL for ${project.title}`}
                  >
                    <Link aria-hidden />
                  </Button>
                </div>
                {project.showcaseUrl && (
                  <a
                    href={project.showcaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline decoration-1 underline-offset-4 hover:decoration-2"
                    aria-label={`Open showcase link for ${project.title} (opens in a new tab)`}
                  >
                    View project <span className="sr-only">opens in a new tab</span>
                  </a>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New capstone project</DialogTitle>
            <DialogDescription>
              Give your project a title and a one-sentence pitch. We will pick your biggest skill gaps
              from your Bridge Map and build the milestone roadmap for you.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="capstone-title" className="text-sm font-medium text-foreground">
                Project title
              </label>
              <Input
                id="capstone-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. ML-powered CV reviewer"
                disabled={saving}
                required
                aria-required="true"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="capstone-pitch" className="text-sm font-medium text-foreground">
                Pitch
              </label>
              <Input
                id="capstone-pitch"
                value={newPitch}
                onChange={(e) => setNewPitch(e.target.value)}
                placeholder="A short sentence about what you will build and show employers."
                disabled={saving}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !newTitle.trim()}>
                Create project
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
