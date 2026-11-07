import { Suspense } from "react";
import type { Metadata } from "next";
import { ProjectView, ProjectViewSkeleton } from "@/components/pods/ProjectView";

export const metadata: Metadata = { title: "Pod project · Keystone" };

type Params = Promise<{ podId: string }>;

async function ProjectViewFromParams({ params }: { params: Params }) {
  const { podId } = await params;
  return <ProjectView podId={podId} />;
}

export default function PodProjectPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<ProjectViewSkeleton />}>
      <ProjectViewFromParams params={params} />
    </Suspense>
  );
}
