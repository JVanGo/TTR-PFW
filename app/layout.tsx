import type { Metadata } from "next";
import Link from "next/link";
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
  title: "FLTT Ranking — with estimated TTR",
  description:
    "The Luxembourg table tennis federation ranking, alongside an estimated German TTR rating for every player.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <header className="border-b">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-4 py-4 sm:px-6">
            <Link href="/" className="text-base font-semibold tracking-tight sm:text-lg">
              FLTT Ranking
            </Link>
            <nav className="flex items-center gap-4 text-sm font-medium">
              <Link href="/" className="hover:underline">
                Rankings
              </Link>
              <Link href="/about" className="hover:underline">
                About
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="bg-muted/40 mt-12 border-t">
          <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>
              FLTT ranking with estimated TTR (Germany). Estimates only — see{" "}
              <Link href="/about" className="underline">
                methodology
              </Link>
              .
            </p>
            <Link href="/login" className="hover:underline">
              Admin
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
