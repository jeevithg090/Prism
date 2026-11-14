"use client";
// A crash inside one app page shows here, inside the shell, so navigation keeps working.
import { useRouter } from "next/navigation";
import { ErrorState, PageHeader } from "@/components/keystone";

export default function AppError({ retry }: { error: unknown; retry: () => void }) {
  const router = useRouter();
  return (
    <div>
      <PageHeader
        title="This page didn't load"
        subtitle="The rest of Keystone still works. Pick another page from the menu, or try this one again."
      />
      <ErrorState
        title="That's on us, not you."
        body="Retry loads the page again. Demo data switches you to Aisha's recorded demo, which always works."
        onRetry={() => retry()}
        onUseDemo={() => router.push(`${window.location.pathname}?demo=1`)}
      />
    </div>
  );
}
