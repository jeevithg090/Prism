"use client";
// Catches a crash in a page outside the app shell (the landing and launch pages). App pages have
// their own boundary in app/(app)/error.tsx, so the sidebar stays put when one of them fails.
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusPage } from "@/components/shell/StatusPage";
import { cn } from "@/lib/utils";

export default function RootError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <StatusPage
      icon={AlertTriangle}
      title="This page didn't load"
      body="That's on us, not you. Try again, or open the dashboard while we sort it out."
    >
      <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }), "h-11 px-5 text-base")}>
        Open your dashboard
      </Link>
      <Button size="lg" onClick={() => retry()}>
        <RotateCw aria-hidden />
        Try again
      </Button>
    </StatusPage>
  );
}
