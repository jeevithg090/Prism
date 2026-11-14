import type { Metadata } from "next";

// The page is a client component, so its title lives here.
export const metadata: Metadata = { title: "Trajectories · Keystone" };

export default function TrajectoriesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
