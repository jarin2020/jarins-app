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

export const metadata: Metadata = {
  title: { default: "jarins — Life OS", template: "%s · jarins" },
  description:
    "A calm personal operating system for family, home, self, learning and career.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "jarins" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#315f4b" },
    { media: "(prefers-color-scheme: dark)", color: "#121a16" },
  ],
  colorScheme: "light dark",
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
