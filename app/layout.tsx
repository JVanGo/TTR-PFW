import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FLTT DTR Ranking",
  description:
    "The Luxembourg table tennis federation ranking, with a DTR rating calculated from real season match results for every player.",
};

/**
 * The true root layout — the only place `<html>`/`<body>` can be rendered,
 * shared by both the localized public site (app/[locale]/**) and the
 * English-only admin/login area (app/admin/**, app/login/**), which sit
 * outside the [locale] segment. `lang` is a static default rather than
 * locale-aware: this layout can't see which locale a nested page picked,
 * and it's just an accessibility/SEO attribute — the actual content is
 * correctly localized regardless via app/[locale]/layout.tsx.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="bg-background text-foreground flex min-h-full flex-col">{children}</body>
    </html>
  );
}
