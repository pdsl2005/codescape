import type { Metadata } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Codescape",
  description: "Explore your codebase as a living city.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)]">
        <div className="min-h-full">
          <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 text-sm text-[#111827]">
              <Link href="/" className="font-semibold tracking-wide text-[#111827] transition hover:text-[var(--accent)]">
                Codescape
              </Link>
              <div className="flex items-center gap-3">
                <nav className="hidden items-center gap-4 md:flex text-[#111827]">
                  <Link href="/" className="rounded-full px-3 py-2 transition hover:bg-[#F3F4F6]">
                    Home
                  </Link>
                  <Link href="/dashboard" className="rounded-full px-3 py-2 transition hover:bg-[#F3F4F6]">
                    Dashboard
                  </Link>
                  <Link href="/friends" className="rounded-full px-3 py-2 transition hover:bg-[#F3F4F6]">
                    Friends
                  </Link>
                  <Link href="/profile" className="rounded-full px-3 py-2 transition hover:bg-[#F3F4F6]">
                    Profile
                  </Link>
                </nav>
                <Link
                  href="/profile"
                  className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--accent)] transition hover:bg-[#EFF6FF]"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
