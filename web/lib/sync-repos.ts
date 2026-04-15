import type { SupabaseClient } from '@supabase/supabase-js'
import { githubFetchJson } from '@/lib/github'

const REPOS_PER_PAGE = 100

type GitHubRepo = {
  id: number
  name: string
  full_name: string
  private: boolean
  owner: { login: string }
  description: string | null
  html_url: string
  default_branch: string
  updated_at: string
  language: string | null
  stargazers_count: number
}

async function fetchUserReposPage(
  githubToken: string,
  page: number
): Promise<GitHubRepo[]> {
  const repos = await githubFetchJson<GitHubRepo[]>(
    githubToken,
    `/user/repos?per_page=${REPOS_PER_PAGE}&sort=updated&page=${page}`
  )

  if (!Array.isArray(repos)) {
    throw new Error('Unexpected GitHub response')
  }

  return repos
}

export async function syncUserRepos(
  supabase: SupabaseClient,
  userId: string,
  githubToken: string
): Promise<{ synced: number }> {
  const repos: GitHubRepo[] = []

  for (let page = 1; ; page += 1) {
    const pageRepos = await fetchUserReposPage(githubToken, page)
    repos.push(...pageRepos)

    if (pageRepos.length < REPOS_PER_PAGE) {
      break
    }
  }

  if (repos.length === 0) {
    return { synced: 0 }
  }

  const syncedAt = new Date().toISOString()
  const rows = repos.map((r) => ({
    user_id: userId,
    repo_owner: r.owner.login,
    repo_name: r.name,
    is_public: !r.private,
    city_state: {
      description: r.description,
      html_url: r.html_url,
      default_branch: r.default_branch,
      updated_at: r.updated_at,
      language: r.language,
      stargazers_count: r.stargazers_count,
    },
    last_synced_at: syncedAt,
  }))

  const { error } = await supabase.from('linked_repos').upsert(rows, {
    onConflict: 'user_id,repo_owner,repo_name',
  })

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`)
  }

  return { synced: rows.length }
}
