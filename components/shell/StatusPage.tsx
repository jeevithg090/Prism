// A full-screen page for the moments outside the app shell: unknown URLs (app/not-found.tsx)
// and crashes above the shell (app/error.tsx). Mark, one heading, one sentence, one primary action.
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { KeystoneMark } from "./Sidebar";

export function StatusPage({
  icon: Icon,
  code,
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  code?: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <main id="main" className="flex min-h-dvh flex-1 flex-col bg-background px-4 py-6 text-foreground md:px-8">
      <Link
        href="/"
        className="flex w-fit items-center gap-2.5 rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <KeystoneMark />
        <span className="text-lg font-semibold tracking-tight">Keystone</span>
      </Link>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center py-16 text-center">
        <span className="mb-6 flex size-14 items-center justify-center rounded-2xl border bg-card shadow-sm">
          <Icon className="size-7 text-primary" aria-hidden />
        </span>
        {code && <p className="font-mono text-sm font-medium text-muted-foreground tabular-nums">{code}</p>}
        <h1 className="mt-2 text-3xl font-semibold text-balance md:text-4xl">{title}</h1>
        <p className="mt-3 max-w-[48ch] text-base text-pretty text-muted-foreground md:text-lg">{body}</p>
        <div className="mt-8 flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">{children}</div>
      </div>
    </main>
  );
}
