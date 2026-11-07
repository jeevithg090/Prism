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
  // The dashboard has its own "Ask Keystone" card, and a floating copy crowded its "Find my pod" button.
  if (pathname?.startsWith("/coach") || pathname === "/dashboard") return null;
  return (
    <>
      {/* Icon-only round button below 2xl, so it never sits on chips, inputs or chart labels; the label
          shows on wide screens with room for it. */}
      <Button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Ask Keystone"
        size="lg"
        className="fixed right-4 bottom-4 z-(--z-sticky) size-12 rounded-full p-0 shadow-lg md:right-6 md:bottom-6 2xl:size-auto 2xl:h-11 2xl:rounded-xl 2xl:px-4"
      >
        <Sparkles className="size-5" aria-hidden />
        <span className="max-2xl:sr-only">Ask Keystone</span>
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
