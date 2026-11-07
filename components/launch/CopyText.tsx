"use client";
// A ready-to-post LinkedIn template with a Copy button. The student posts it themselves; Keystone never posts.
import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function CopyText({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = React.useState<"idle" | "ok" | "fail">("idle");
  const area = React.useRef<HTMLTextAreaElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      area.current?.select();
      setCopied(document.execCommand?.("copy") ? "ok" : "fail");
    }
    setTimeout(() => setCopied("idle"), 2500);
  };
  return (
    <div className="space-y-3">
      <Label htmlFor="linkedin-post">{label}</Label>
      <textarea
        id="linkedin-post" ref={area} readOnly value={text} rows={14}
        className="w-full resize-y rounded-xl border border-input bg-muted/60 p-4 font-mono text-sm leading-6 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" className="h-10 rounded-xl" onClick={() => void copy()}>
          {copied === "ok" ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied === "ok" ? "Copied" : "Copy post"}
        </Button>
        <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {copied === "ok" ? "Copied. Edit it before you post." : copied === "fail" ? "Select the text and copy it yourself." : ""}
        </span>
      </div>
    </div>
  );
}
