"use client";
// P5 · Floating "Ask Keystone" button: opens the Coach in a side sheet on any page except /coach, which is the Coach.
import * as React from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CoachPanel } from "./CoachPanel";

export function CoachLauncher({ userId }: { userId?: string }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  // The Coach page already is the Coach: a second copy in a sheet would cover it and add a second ink action.
  if (pathname?.startsWith("/coach")) return null;
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        size="lg"
        className="fixed right-4 bottom-4 z-40 shadow-lg md:right-6 md:bottom-6"
      >
        <Sparkles aria-hidden />
        Ask Keystone
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b p-4 pr-12">
            <SheetTitle className="text-lg font-semibold">Keystone Coach</SheetTitle>
            <SheetDescription>Plans with you, asks Keystone&apos;s agents, and checks with you before it touches GitHub.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <CoachPanel userId={userId} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
