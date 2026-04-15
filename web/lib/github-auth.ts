import 'server-only'

import { createClient } from '@/lib/supabase-server'

type SessionWithGitHubToken =
  | {
      provider_token?: string | null
    }
  | null
  | undefined

export class GitHubAuthError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'GitHubAuthError'
    this.status = status
  }
}

export function requireGitHubTokenFromSession(
  session: SessionWithGitHubToken
): string {
  if (!session) {
    throw new GitHubAuthError(401, 'Not authenticated')
  }

  const githubToken = session.provider_token?.trim()
  if (!githubToken) {
    throw new GitHubAuthError(
      400,
      'GitHub token not available on session. Sign in again.'
    )
  }

  return githubToken
}

export async function requireGitHubSession() {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new GitHubAuthError(401, 'Not authenticated')
  }

  const githubToken = requireGitHubTokenFromSession(session)

  return {
    supabase,
    session,
    githubToken,
  }
}
