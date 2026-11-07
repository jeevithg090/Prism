import Link from "next/link";
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-5xl font-semibold tracking-tight">Keystone</h1>
      <p className="text-lg text-muted-foreground">Your degree is the foundation. Keystone builds the bridge to industry.</p>
      <Link href="/pods?demo=1" className="rounded-xl bg-primary px-4 py-2 text-primary-foreground">Try the demo</Link>
    </main>
  );
}
