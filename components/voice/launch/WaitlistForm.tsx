"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinWaitlist, type WaitlistRole } from "@/lib/voice/waitlist";

export const CONSENT_TEXT = "I agree Keystone can email me about Bridge Week. No spam; unsubscribe anytime.";

// Quick client-side check for instant feedback; the server action is the real gate.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = { email?: string; consent?: string; form?: string };

export type WaitlistFormProps = {
  role?: WaitlistRole;
  submitLabel?: string;
  emailLabel?: string;
  /** "dark" when the form sits on the indigo band. */
  surface?: "light" | "dark";
};

export function WaitlistForm({
  role = "student",
  submitLabel = "Join the waitlist",
  emailLabel = "Your email",
  surface = "light",
}: WaitlistFormProps) {
  const uid = useId();
  const emailId = `${uid}-email`;
  const consentId = `${uid}-consent`;
  const focusField = (id: string) => document.getElementById(id)?.focus();

  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [joinedAs, setJoinedAs] = useState<string | null>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const backToEmail = useRef(false);

  // The form unmounts on success, so move focus somewhere sensible instead of letting it fall
  // to <body>: to the confirmation, then back to the email field after "Add another email".
  useEffect(() => {
    if (joinedAs) {
      successRef.current?.focus();
    } else if (backToEmail.current) {
      backToEmail.current = false;
      document.getElementById(emailId)?.focus();
    }
  }, [joinedAs, emailId]);

  const dark = surface === "dark";
  const muted = dark ? "text-indigo-100" : "text-muted-foreground";
  const errorText = dark ? "text-rose-200" : "text-status-gap";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const trimmed = email.trim();
    const next: Errors = {};
    if (!LOOKS_LIKE_EMAIL.test(trimmed)) next.email = "Please enter a valid email address, like name@student.manchester.ac.uk.";
    if (!consent) next.consent = "Please tick the box so we're allowed to email you about Bridge Week.";
    if (next.email || next.consent) {
      setErrors(next);
      focusField(next.email ? emailId : consentId);
      return;
    }

    setErrors({});
    setPending(true);
    try {
      const res = await joinWaitlist(trimmed, consent, role);
      if (res.ok) {
        setJoinedAs(trimmed.toLowerCase());
        toast.success(role === "ambassador" ? "You're on the ambassador list" : "You're on the list");
        return;
      }
      const msg = res.error ?? "Something went wrong. Please try again.";
      if (res.field === "email") {
        setErrors({ email: msg });
        focusField(emailId);
      } else if (res.field === "consent") {
        setErrors({ consent: msg });
        focusField(consentId);
      } else {
        setErrors({ form: msg });
      }
    } catch {
      setErrors({ form: "We couldn't reach Keystone just now. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  const fieldRing = dark
    ? "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e1b4b]"
    : "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  const success = joinedAs ? (
    <div
      className={`flex items-start gap-4 rounded-2xl p-6 ${dark ? "bg-white/10 text-white" : "bg-status-proven/10 text-foreground"} motion-safe:animate-in motion-safe:fade-in`}
    >
      <CheckCircle2
        className={`mt-0.5 size-7 shrink-0 ${dark ? "text-emerald-300" : "text-status-proven"}`}
        aria-hidden="true"
      />
      <div className="space-y-2">
        <p ref={successRef} tabIndex={-1} className="rounded-md text-xl font-semibold focus:outline-none">
          You&apos;re on the list
        </p>
        <p className={`text-base ${muted}`}>
          {role === "ambassador"
            ? `Thank you. We'll email ${joinedAs} with the ambassador pack before Bridge Week starts.`
            : `We'll email ${joinedAs} before Bridge Week starts, with your pod sign-up link.`}
        </p>
        <button
          type="button"
          onClick={() => {
            backToEmail.current = true;
            setJoinedAs(null);
            setEmail("");
            setConsent(false);
          }}
          className={`rounded-md text-sm font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 ${dark ? "text-white focus-visible:ring-white" : "text-primary focus-visible:ring-ring"}`}
        >
          Add another email
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div>
      {/* Always mounted, so screen readers announce the confirmation when it is added. */}
      <div role="status">{success}</div>

      {!joinedAs && (
        <form noValidate onSubmit={onSubmit} aria-busy={pending} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor={emailId} className={`text-base font-semibold ${dark ? "text-white" : "text-foreground"}`}>
              {emailLabel}
            </Label>
            <Input
              id={emailId}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="name@student.manchester.ac.uk"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((x) => ({ ...x, email: undefined }));
              }}
              required
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? `${emailId}-error` : undefined}
              className={`h-12 w-full min-w-0 rounded-xl border bg-white px-4 text-base text-[#0f172a] placeholder:text-slate-500 focus-visible:outline-none ${fieldRing} ${errors.email ? "border-status-gap" : "border-border"}`}
            />
            {errors.email && (
              <p id={`${emailId}-error`} className={`text-sm font-medium ${errorText}`}>
                {errors.email}
              </p>
            )}
          </div>

          {/* Consent comes before the button, so you meet it before you submit (reading and tab order). */}
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <input
                id={consentId}
                name="consent"
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  if (errors.consent) setErrors((x) => ({ ...x, consent: undefined }));
                }}
                aria-invalid={errors.consent ? true : undefined}
                aria-describedby={errors.consent ? `${consentId}-error` : undefined}
                className={`mt-1 size-5 shrink-0 rounded accent-[#4338ca] focus-visible:outline-none ${fieldRing}`}
              />
              <label
                htmlFor={consentId}
                className={`text-base leading-snug ${dark ? "text-indigo-50" : "text-foreground"}`}
              >
                {CONSENT_TEXT}
              </label>
            </div>
            {errors.consent && (
              <p id={`${consentId}-error`} className={`pl-8 text-sm font-medium ${errorText}`}>
                {errors.consent}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={pending}
            className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold focus-visible:outline-none disabled:opacity-70 motion-safe:transition-colors sm:w-auto ${fieldRing} ${dark ? "bg-amber-300 text-[#1e1b4b] hover:bg-amber-200" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
          >
            {pending && <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />}
            {pending ? "Joining…" : submitLabel}
          </Button>

          <p aria-live="polite" className={`min-h-0 text-sm font-medium ${errorText}`}>
            {errors.form ?? ""}
          </p>
          <p className={`text-sm ${muted}`}>We only use your email for Bridge Week, and we never share it.</p>
        </form>
      )}
    </div>
  );
}

export default WaitlistForm;
