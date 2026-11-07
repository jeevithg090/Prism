import { Suspense } from "react";
import type { Metadata } from "next";
import { PassportSkeleton, PassportView } from "@/components/passport/PassportView";

export const metadata: Metadata = { title: "Skill Passport · Keystone" };

type Params = Promise<{ id: string }>;

async function PassportFromParams({ params }: { params: Params }) {
  const { id } = await params;
  return <PassportView userId={id} />;
}

export default function SkillPassportPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PassportSkeleton />}>
      <PassportFromParams params={params} />
    </Suspense>
  );
}
