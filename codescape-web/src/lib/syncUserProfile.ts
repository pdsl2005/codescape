import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export function getGithubFieldsFromSession(session: Session): {
  githubId: string | null
  username: string | null
  avatarUrl: string | null
} {
  const user = session.user
  const ghIdentity = user.identities?.find((i) => i.provider === 'github')
  const providerId = ghIdentity?.provider_id
  const meta = user.user_metadata ?? {}
  const username =
    (typeof meta.user_name === 'string' && meta.user_name) ||
    (typeof meta.preferred_username === 'string' && meta.preferred_username) ||
    (typeof meta.name === 'string' && meta.name) ||
    null
  const avatarUrl =
    (typeof meta.avatar_url === 'string' && meta.avatar_url) || null
  return {
    githubId: providerId != null && providerId !== '' ? String(providerId) : null,
    username,
    avatarUrl,
  }
}

/**
 * Keeps public.users in sync with the latest GitHub profile from Supabase Auth
 * and stores github_id so the VS Code extension can resolve the same row via GitHub API.
 */
export async function syncUserProfileFromSession(session: Session): Promise<void> {
  const { githubId, username, avatarUrl } = getGithubFieldsFromSession(session)
  if (!githubId || !username) {
    console.warn(
      'syncUserProfileFromSession: missing GitHub provider_id or username; skipping upsert',
      { githubId, username },
    )
    return
  }

  const { error } = await supabase.from('users').upsert(
    {
      id: session.user.id,
      username,
      avatar_url: avatarUrl,
      github_id: githubId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (error) {
    console.error('syncUserProfileFromSession failed', error)
    throw error
  }
}
