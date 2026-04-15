import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'

type RepoRow = {
  repo_owner: string
  repo_name: string
  is_public: boolean
  city_state: {
    description: string | null
    html_url: string
    default_branch: string
    updated_at: string
    language: string | null
    stargazers_count: number
  } | null
  last_synced_at: string | null
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/')
  }

  const { data, error } = await supabase
    .from('linked_repos')
    .select('repo_owner, repo_name, is_public, city_state, last_synced_at')
    .eq('user_id', session.user.id)
    .order('last_synced_at', { ascending: false })

  const repos = (data ?? []) as RepoRow[]

  return (
    <div className="flex flex-col flex-1 p-8 gap-6 max-w-5xl mx-auto w-full">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your repositories</h1>
          <p className="text-sm text-zinc-500">
            Signed in as {session.user.user_metadata.user_name ?? session.user.email}
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          Failed to load repos: {error.message}
        </div>
      )}

      {!error && repos.length === 0 && (
        <p className="text-zinc-500">No repositories synced yet.</p>
      )}

      {repos.length > 0 && (
        <ul className="flex flex-col gap-3">
          {repos.map((r) => (
            <li
              key={`${r.repo_owner}/${r.repo_name}`}
              className="rounded border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between">
                <a
                  href={r.city_state?.html_url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:underline"
                >
                  {r.repo_owner}/{r.repo_name}
                </a>
                <span className="text-xs text-zinc-500">
                  {r.is_public ? 'public' : 'private'}
                </span>
              </div>
              {r.city_state?.description && (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {r.city_state.description}
                </p>
              )}
              <div className="mt-2 flex gap-3 text-xs text-zinc-500">
                {r.city_state?.language && <span>{r.city_state.language}</span>}
                {r.city_state && (
                  <span>★ {r.city_state.stargazers_count}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
