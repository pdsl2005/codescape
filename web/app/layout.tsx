import type { Metadata } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase-server";
import SignInButton from "@/components/SignInButton";
import SignOutButton from "@/components/SignOutButton";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const username =
    (user?.user_metadata?.user_name as string | undefined) ??
    (user?.user_metadata?.preferred_username as string | undefined) ??
    user?.email ??
    null;
  const avatarUrl =
    (user?.user_metadata?.avatar_url as string | undefined) ?? null;

  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)]">
        <div className="min-h-full">
          <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 text-sm text-[#111827]">
              <Link
                href="/"
                className="font-semibold tracking-wide text-[#111827] transition hover:text-[var(--accent)]"
              >
                Codescape
              </Link>
              <div className="flex items-center gap-3">
                <nav className="hidden items-center gap-4 md:flex text-[#111827]">
                  <Link
                    href="/"
                    className="rounded-full px-3 py-2 transition hover:bg-[#F3F4F6]"
                  >
                    Home
                  </Link>
                  <Link
                    href="/dashboard"
                    className="rounded-full px-3 py-2 transition hover:bg-[#F3F4F6]"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/friends"
                    className="rounded-full px-3 py-2 transition hover:bg-[#F3F4F6]"
                  >
                    Friends
                  </Link>
                </nav>
                {user ? (
                  <div className="flex items-center gap-3">
                    <Link
                      href="/profile"
                      className="flex items-center gap-2 rounded-full px-3 py-1.5 transition hover:bg-[#F3F4F6]"
                    >
                      {avatarUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarUrl}
                          alt={username ?? "avatar"}
                          className="h-7 w-7 rounded-full border border-[var(--border)]"
                        />
                      )}
                      {username && (
                        <span className="hidden text-sm font-medium text-[#111827] sm:block">
                          {username}
                        </span>
                      )}
                    </Link>
                    <SignOutButton />
                  </div>
                ) : (
                  <SignInButton />
                )}
              </div>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
