import { NextResponse } from 'next/server'
import { GitHubAuthError, requireGitHubTokenFromSession } from '@/lib/github-auth'
import { createClient } from '@/lib/supabase-server'
import { syncUserRepos } from '@/lib/sync-repos'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=missing_code`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/?error=auth`)
  }

  try {
    const githubToken = requireGitHubTokenFromSession(data.session)
    await syncUserRepos(supabase, data.session.user.id, githubToken)
  } catch (err) {
    if (!(err instanceof GitHubAuthError)) {
      console.error('Repo sync failed on auth callback:', err)
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
