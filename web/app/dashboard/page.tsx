import { redirect } from "next/navigation";
import Link from "next/link";
import { Star, GitBranch, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase-server";

type RepoRow = {
  repo_owner: string;
  repo_name: string;
  is_public: boolean;
  city_state: {
    description: string | null;
    html_url: string;
    default_branch: string;
    updated_at: string;
    language: string | null;
    stargazers_count: number;
  } | null;
  last_synced_at: string | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data, error } = await supabase
    .from("linked_repos")
    .select("repo_owner, repo_name, is_public, city_state, last_synced_at")
    .eq("user_id", user.id)
    .order("last_synced_at", { ascending: false });

  const repos = (data ?? []) as RepoRow[];
  const username =
    (user.user_metadata?.user_name as string | undefined) ??
    (user.user_metadata?.preferred_username as string | undefined) ??
    user.email ??
    "";

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#F0F9FF] px-6 py-10 text-[#111827] sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="rounded-[2rem] border border-white/60 bg-white/50 p-8 shadow-[0_28px_60px_-30px_rgba(59,130,246,0.24)] backdrop-blur-[12px]">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#4B5563]">
            Repositories
          </p>
          <h1 className="mt-3 text-5xl font-bold text-[#111827]">
            Your repositories
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-[#4B5563]">
            Signed in as{" "}
            <span className="font-semibold text-[#111827]">{username}</span>.
            Repositories are synced from GitHub on sign-in.
          </p>
        </div>

        {error && (
          <div className="rounded-[2rem] border border-red-200 bg-red-50/80 p-6 text-sm text-red-700 backdrop-blur-[12px]">
            Failed to load repos: {error.message}
          </div>
        )}

        {!error && repos.length === 0 && (
          <div className="rounded-[2rem] border border-white/60 bg-white/50 p-10 text-center shadow-[0_24px_60px_-30px_rgba(59,130,246,0.18)] backdrop-blur-[12px]">
            <p className="text-lg font-semibold text-[#111827]">
              No repositories synced yet
            </p>
            <p className="mt-2 text-sm text-[#4B5563]">
              Sign out and back in with GitHub to re-sync, or make sure your
              account has the correct scopes.
            </p>
          </div>
        )}

        {repos.length > 0 && (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {repos.map((r) => (
              <article
                key={`${r.repo_owner}/${r.repo_name}`}
                className="flex flex-col gap-4 rounded-[2rem] border border-white/60 bg-white/50 p-6 shadow-[0_24px_60px_-30px_rgba(59,130,246,0.18)] backdrop-blur-[12px] transition hover:-translate-y-0.5 hover:shadow-[0_28px_60px_-30px_rgba(59,130,246,0.28)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <GitBranch size={18} className="text-[#3B82F6]" />
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#4B5563]">
                      {r.repo_owner}
                    </p>
                  </div>
                  <span
                    className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
                      r.is_public
                        ? "bg-[#DCFCE7] text-[#047857]"
                        : "bg-[#EFF6FF] text-[#2563EB]"
                    }`}
                  >
                    {r.is_public ? "Public" : "Private"}
                  </span>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-[#111827]">
                    {r.repo_name}
                  </h2>
                  {r.city_state?.description && (
                    <p className="mt-2 text-sm leading-6 text-[#4B5563]">
                      {r.city_state.description}
                    </p>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between text-xs text-[#4B5563]">
                  <div className="flex items-center gap-4">
                    {r.city_state?.language && (
                      <span className="font-medium text-[#111827]">
                        {r.city_state.language}
                      </span>
                    )}
                    {r.city_state && (
                      <span className="flex items-center gap-1">
                        <Star size={14} className="text-[#3B82F6]" />
                        {r.city_state.stargazers_count}
                      </span>
                    )}
                  </div>
                  {r.city_state?.html_url && (
                    <Link
                      href={r.city_state.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-white px-3 py-1 font-semibold text-[var(--accent)] transition hover:bg-[#EFF6FF]"
                    >
                      View
                      <ExternalLink size={12} />
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
