import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { StatusPage } from "@/components/shell/StatusPage";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Page not found · Keystone" };

/** Every unknown URL lands here (Next serves it with a 404 status). */
export default function NotFound() {
  return (
    <StatusPage
      icon={Compass}
      code="404"
      title="We can't find that page"
      body="The link may be old, or the address may have a typo. Your dashboard has everything Keystone has planned for you."
    >
      <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "h-11 px-5 text-base")}>
        Back to the home page
      </Link>
      <Link href="/dashboard" className={cn(buttonVariants({ size: "lg" }))}>
        Open your dashboard
      </Link>
    </StatusPage>
  );
}
