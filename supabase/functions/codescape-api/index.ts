import { corsHeaders, empty, json } from '../_shared/cors.ts'
import {
  createAdminClient,
  createUserClient,
  handleError,
  HttpError,
  requireUser,
} from '../_shared/auth.ts'
import type { User } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function extractSegments(req: Request): string[] {
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const fnIdx = parts.indexOf('codescape-api')
  if (fnIdx >= 0 && fnIdx < parts.length - 1) {
    return parts.slice(fnIdx + 1)
  }
  const pathParam = url.searchParams.get('path')
  if (pathParam) {
    return pathParam.replace(/^\//, '').split('/').filter(Boolean)
  }
  return []
}

async function handleGetMyRepos(user: User, token: string): Promise<Response> {
  const sb = createUserClient(token)
  const { data, error } = await sb
    .from('linked_repos')
    .select(
      'id, user_id, repo_owner, repo_name, is_public, city_state, last_synced_at',
    )
    .eq('user_id', user.id)
    .order('repo_owner', { ascending: true })
    .order('repo_name', { ascending: true })

  if (error) {
    console.error('handleGetMyRepos user client', error)
    const admin = createAdminClient()
    const { data: rows, error: adminErr } = await admin
      .from('linked_repos')
      .select(
        'id, user_id, repo_owner, repo_name, is_public, city_state, last_synced_at',
      )
      .eq('user_id', user.id)
      .order('repo_owner', { ascending: true })
      .order('repo_name', { ascending: true })
    if (adminErr) {
      throw new HttpError(500, adminErr.message)
    }
    return json({ repos: rows ?? [] })
  }
  return json({ repos: data ?? [] })
}

async function handlePatchRepo(
  req: Request,
  user: User,
  token: string,
  repoId: string,
): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new HttpError(400, 'Request body must be JSON')
  }
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    typeof (body as { is_public?: unknown }).is_public !== 'boolean'
  ) {
    throw new HttpError(400, 'Body must be an object with boolean is_public')
  }
  const is_public = (body as { is_public: boolean }).is_public

  const sb = createUserClient(token)
  const { data, error } = await sb
    .from('linked_repos')
    .update({ is_public })
    .eq('id', repoId)
    .eq('user_id', user.id)
    .select(
      'id, user_id, repo_owner, repo_name, is_public, city_state, last_synced_at',
    )
    .maybeSingle()

  if (error) {
    console.error('handlePatchRepo user client', error)
    const admin = createAdminClient()
    const { data: existing } = await admin
      .from('linked_repos')
      .select('id')
      .eq('id', repoId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!existing) {
      throw new HttpError(404, 'Repository link not found')
    }
    const { data: updated, error: upErr } = await admin
      .from('linked_repos')
      .update({ is_public })
      .eq('id', repoId)
      .eq('user_id', user.id)
      .select(
        'id, user_id, repo_owner, repo_name, is_public, city_state, last_synced_at',
      )
      .maybeSingle()
    if (upErr || !updated) {
      throw new HttpError(500, upErr?.message ?? 'Update failed')
    }
    return json({ repo: updated })
  }

  if (!data) {
    throw new HttpError(404, 'Repository link not found')
  }
  return json({ repo: data })
}

async function resolveUserIdByUsername(username: string): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('users')
    .select('id')
    .eq('username', username)
    .maybeSingle()
  if (error) {
    console.error('resolveUserIdByUsername', error)
    throw new HttpError(500, error.message)
  }
  if (!data?.id) {
    throw new HttpError(404, 'User not found')
  }
  return data.id as string
}

async function handleFollow(
  user: User,
  targetUsername: string,
): Promise<Response> {
  const decoded = decodeURIComponent(targetUsername)
  if (!decoded) {
    throw new HttpError(400, 'Invalid username')
  }

  const targetId = await resolveUserIdByUsername(decoded)
  if (targetId === user.id) {
    throw new HttpError(400, 'Cannot follow yourself')
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('follows')
    .select('follower_id')
    .eq('follower_id', user.id)
    .eq('following_id', targetId)
    .maybeSingle()

  if (existing) {
    return json({ following: true, alreadyFollowing: true })
  }

  const { error } = await admin.from('follows').insert({
    follower_id: user.id,
    following_id: targetId,
  })

  if (error) {
    if (error.code === '23505') {
      return json({ following: true, alreadyFollowing: true })
    }
    console.error('handleFollow insert', error)
    throw new HttpError(500, error.message)
  }
  return json({ following: true, created: true })
}

async function handleUnfollow(
  user: User,
  targetUsername: string,
): Promise<Response> {
  const decoded = decodeURIComponent(targetUsername)
  let targetId: string
  try {
    targetId = await resolveUserIdByUsername(decoded)
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) {
      return empty(204)
    }
    throw e
  }

  const admin = createAdminClient()
  await admin
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('following_id', targetId)

  return empty(204)
}

async function handleGetPublicProfile(username: string): Promise<Response> {
  const decoded = decodeURIComponent(username)
  const admin = createAdminClient()
  const { data: profile, error: pErr } = await admin
    .from('users')
    .select('id, username, avatar_url, created_at')
    .eq('username', decoded)
    .maybeSingle()

  if (pErr) {
    console.error('handleGetPublicProfile user', pErr)
    throw new HttpError(500, pErr.message)
  }
  if (!profile) {
    throw new HttpError(404, 'User not found')
  }

  const { data: repos, error: rErr } = await admin
    .from('linked_repos')
    .select(
      'id, repo_owner, repo_name, is_public, city_state, last_synced_at',
    )
    .eq('user_id', profile.id)
    .eq('is_public', true)
    .order('repo_owner', { ascending: true })
    .order('repo_name', { ascending: true })

  if (rErr) {
    console.error('handleGetPublicProfile repos', rErr)
    throw new HttpError(500, rErr.message)
  }

  return json({
    user: profile,
    repos: repos ?? [],
  })
}

/**
 * VS Code (or any client) sends a GitHub OAuth token from the GitHub auth provider.
 * We verify it with GitHub, then resolve the Codescape user row by github_id.
 */
async function handleExtensionLink(req: Request): Promise<Response> {
  const ghToken = req.headers.get('X-GitHub-Access-Token')?.trim()
  if (!ghToken) {
    throw new HttpError(400, 'Missing X-GitHub-Access-Token header')
  }

  const ghRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (ghRes.status === 401) {
    throw new HttpError(401, 'Invalid or expired GitHub token')
  }
  if (!ghRes.ok) {
    const text = await ghRes.text().catch(() => '')
    throw new HttpError(502, `GitHub API error: ${ghRes.status} ${text}`)
  }

  const ghUser = await ghRes.json() as {
    id: number
    login: string
    avatar_url?: string | null
  }
  const githubId = String(ghUser.id)

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('users')
    .select('id, username, avatar_url, github_id')
    .eq('github_id', githubId)
    .maybeSingle()

  if (error) {
    console.error('handleExtensionLink lookup', error)
    throw new HttpError(500, error.message)
  }

  if (!row) {
    return json(
      {
        error:
          'No Codescape account is linked to this GitHub user. Sign in with GitHub on the Codescape website first.',
        code: 'ACCOUNT_NOT_LINKED',
      },
      404,
    )
  }

  const { error: upErr } = await admin
    .from('users')
    .update({
      username: ghUser.login,
      avatar_url: ghUser.avatar_url ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)

  if (upErr) {
    console.error('handleExtensionLink profile refresh', upErr)
  }

  return json({
    supabase_user_id: row.id,
    github_id: githubId,
    github_login: ghUser.login,
    avatar_url: ghUser.avatar_url ?? row.avatar_url,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const segments = extractSegments(req)
    const method = req.method
    const pathKey = segments.join('/')

    if (method === 'POST' && pathKey === 'extension/link') {
      return await handleExtensionLink(req)
    }

    if (method === 'GET' && pathKey === 'users/me/repos') {
      const { user, token } = await requireUser(req)
      return await handleGetMyRepos(user, token)
    }

    if (
      method === 'PATCH' &&
      segments.length === 2 &&
      segments[0] === 'repos' &&
      UUID_RE.test(segments[1] ?? '')
    ) {
      const { user, token } = await requireUser(req)
      return await handlePatchRepo(req, user, token, segments[1])
    }

    if (method === 'POST' && segments[0] === 'follow' && segments.length === 2) {
      const { user } = await requireUser(req)
      return await handleFollow(user, segments[1])
    }

    if (
      method === 'DELETE' &&
      segments[0] === 'follow' &&
      segments.length === 2
    ) {
      const { user } = await requireUser(req)
      return await handleUnfollow(user, segments[1])
    }

    if (
      method === 'GET' &&
      segments[0] === 'users' &&
      segments.length === 2 &&
      segments[1] !== 'me'
    ) {
      return await handleGetPublicProfile(segments[1])
    }

    return json(
      {
        error: 'Not found',
        hint:
          'Call paths under /functions/v1/codescape-api, e.g. .../codescape-api/users/me/repos. If your gateway strips trailing segments, use ?path=users/me/repos',
        segments,
      },
      404,
    )
  } catch (e) {
    return handleError(e)
  }
})
