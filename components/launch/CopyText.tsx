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
        id="linkedin-post" ref={area} readOnly value={text} rows={13}
        className="w-full resize-y rounded-lg border border-input bg-card p-4 text-base leading-7 text-foreground outline-2 -outline-offset-2 outline-transparent focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-55"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="lg" onClick={() => void copy()}>
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
