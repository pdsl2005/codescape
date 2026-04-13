import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { json } from './cors.ts'

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export function createUserClient(accessToken: string) {
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anon) {
    throw new HttpError(500, 'Missing SUPABASE_URL or SUPABASE_ANON_KEY')
  }
  return createClient(url, anon, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  })
}

export function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    throw new HttpError(500, 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key)
}

export async function requireUser(req: Request): Promise<{ user: User; token: string }> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.toLowerCase().startsWith('bearer ')) {
    throw new HttpError(401, 'Authorization header must be a Bearer token')
  }
  const token = authHeader.slice(7).trim()
  if (!token) {
    throw new HttpError(401, 'Missing access token')
  }
  const admin = createAdminClient()
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) {
    throw new HttpError(401, 'Invalid or expired access token')
  }
  return { user, token }
}

export function handleError(e: unknown): Response {
  if (e instanceof HttpError) {
    return json({ error: e.message }, e.status)
  }
  console.error(e)
  return json({ error: 'Internal server error' }, 500)
}
