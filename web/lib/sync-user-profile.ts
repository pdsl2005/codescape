import type { SupabaseClient, User } from '@supabase/supabase-js'

function getGitHubFieldsFromUser(user: User): {
  githubId: string | null
  username: string | null
  avatarUrl: string | null
} {
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

export async function syncUserProfile(
  supabase: SupabaseClient,
  user: User
): Promise<void> {
  const { githubId, username, avatarUrl } = getGitHubFieldsFromUser(user)

  if (!githubId || !username) {
    console.warn('syncUserProfile: missing GitHub provider_id or username; skipping upsert', {
      githubId,
      username,
    })
    return
  }

  const { error } = await supabase.from('users').upsert(
    {
      id: user.id,
      username,
      avatar_url: avatarUrl,
      github_id: githubId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )

  if (error) {
    console.error('syncUserProfile failed', error)
    throw error
  }
}
