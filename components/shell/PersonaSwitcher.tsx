"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import demoProfile from "@/data/fixtures/profile.aisha.json";
import { BadgePill } from "@/components/keystone";
import { Button } from "@/components/ui/button";

type Student = { id: string; name: string; badges?: string[] };
const students: Student[] = [];

export function PersonaSwitcher() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const current = demoProfile as Student;
  const choices = [current, ...students.filter((student) => student.id !== current.id)];
  function select(id: string) { document.cookie = `ks_uid=${encodeURIComponent(id)}; path=/; max-age=604800`; setOpen(false); router.refresh(); }
  return <div className="relative">
    <Button variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" className="h-auto justify-start gap-2 px-2">
      <span className="grid size-9 place-items-center rounded-full bg-primary/10 font-semibold text-primary">{current.name.slice(0, 1)}</span>
      <span className="hidden text-left sm:block"><span className="block text-sm font-medium">{current.name}</span><span className="hidden gap-1 lg:flex"><BadgePill badge="new-to-uni"/></span></span><ChevronDown size={15}/>
    </Button>
    {open && <div role="menu" aria-label="Choose student" className="absolute left-0 top-12 z-50 max-h-80 w-64 overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-xl">
      {choices.map((student) => <button key={student.id} role="menuitem" onClick={() => select(student.id)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-background"><span className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary">{student.name.slice(0, 1)}</span>{student.name}</button>)}
      {!students.length && <p className="px-3 py-2 text-xs text-muted-foreground">Seeded classmates will appear here when P5 data is added.</p>}
    </div>}
  </div>;
}
