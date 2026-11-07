import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/keystone";
import { CredentialSkeleton, CredentialStudio } from "@/components/labs/credential/CredentialStudio";

export const metadata: Metadata = { title: "Verifiable Skill Credential · Keystone" };

export default function CredentialPage() {
  return (
    <>
      <PageHeader
        title="Verifiable Skill Credential"
        subtitle="Every proof on your ladder is hashed into one tree that Keystone signs. You choose which skills a link reveals, and an employer can check each one without trusting you or us."
      />
      <Suspense fallback={<CredentialSkeleton />}>
        <CredentialStudio />
      </Suspense>
    </>
  );
}
