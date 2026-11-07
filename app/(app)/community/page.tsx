import type { Metadata } from "next";
import { PageHeader } from "@/components/keystone";
import { CommunityView } from "@/components/community/CommunityView";

export const metadata: Metadata = { title: "Community · Keystone" };

export default function CommunityPage() {
  return (
    <>
      <PageHeader
        title="Community"
        subtitle="Learning by teaching: help a newcomer, ask for help, learn from practitioners."
      />
      <CommunityView />
    </>
  );
}
