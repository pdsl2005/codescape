'use client'

import { createClient } from '@/lib/supabase-browser'
import { GITHUB_OAUTH_SCOPE } from '@/lib/github-config'

type Props = {
  className?: string
  children?: React.ReactNode
}

export default function SignInButton({
  className = 'rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--accent)] transition hover:bg-[#EFF6FF]',
  children = 'Sign in',
}: Props) {
  const signIn = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        scopes: GITHUB_OAUTH_SCOPE,
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <button onClick={signIn} className={className}>
      {children}
    </button>
  )
}
