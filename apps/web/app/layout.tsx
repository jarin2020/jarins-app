import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

// Previously `Inter` was named in globals.css but never loaded, so every machine
// without it installed silently rendered in system sans. next/font self-hosts it,
// which also keeps the CSP at `font-src 'self'`.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

/**
 * Every route renders per request.
 *
 * The CSP nonce is generated in middleware and has to be stamped onto each
 * script tag. A statically prerendered page has its HTML baked at build time,
 * so no nonce can be injected — and because the policy uses 'strict-dynamic',
 * unnonced scripts are refused rather than merely unverified. That combination
 * white-screened /today in production while every dynamic route worked.
 *
 * The cost here is close to zero: every screen is client-rendered and, once
 * Supabase is configured, sits behind an auth check in middleware anyway.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "jarins — Life OS", template: "%s · jarins" },
  description:
    "A calm personal operating system for family, home, self, learning and career.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "jarins" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={inter.variable}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
