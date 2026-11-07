import { Providers } from "@/app/providers";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { MobileNav } from "@/components/shell/MobileNav";
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Providers><div className="flex min-h-screen"><Sidebar/><div className="min-w-0 flex-1"><TopBar/><main className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">{children}</main></div><MobileNav/></div></Providers>;
}
