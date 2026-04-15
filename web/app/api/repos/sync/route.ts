import { NextResponse } from 'next/server'
import { GitHubApiError } from '@/lib/github'
import { GitHubAuthError, requireGitHubSession } from '@/lib/github-auth'
import { syncUserRepos } from '@/lib/sync-repos'

export async function POST() {
  try {
    const { supabase, session, githubToken } = await requireGitHubSession()
    const result = await syncUserRepos(supabase, session.user.id, githubToken)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof GitHubAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    if (err instanceof GitHubApiError) {
      const status = err.status === 401 || err.status === 403 ? err.status : 502
      return NextResponse.json({ error: err.message }, { status })
    }

    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
