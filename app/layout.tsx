import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";

// Two families: Instrument Sans for every word (stands in for the Coral theme's General Sans),
// Geist Mono only for figures and code.
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const DESCRIPTION = "Your degree is the foundation. Keystone builds the bridge to industry.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Keystone",
  description: DESCRIPTION,
  applicationName: "Keystone",
  openGraph: {
    type: "website",
    siteName: "Keystone",
    title: "Keystone",
    description: DESCRIPTION,
    locale: "en_GB",
  },
  twitter: { card: "summary_large_image", title: "Keystone", description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#1d1614" },
  ],
};

// Applies a saved dark theme before first paint, so a reload never flashes the light theme.
// Light stays the default (projectors); ThemeToggle writes the same key.
const THEME_SCRIPT = `try{if(localStorage.getItem("ks_theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: THEME_SCRIPT may add the .dark class before React hydrates.
    <html lang="en" className={`${instrumentSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
