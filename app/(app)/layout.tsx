import { Providers } from "@/app/providers";
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Providers><main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</main></Providers>;
}
