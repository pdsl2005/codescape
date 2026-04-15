import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('linked_repos')
    .select('repo_owner, repo_name, is_public, city_state, last_synced_at')
    .eq('user_id', session.user.id)
    .order('last_synced_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ repos: data })
}
