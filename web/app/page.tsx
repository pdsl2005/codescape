'use client'

import { createClient } from '@/lib/supabase-browser'
import { GITHUB_OAUTH_SCOPE } from '@/lib/github-config'

export default function Home() {
  const signInWithGitHub = async () => {
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
    <div className="flex flex-col flex-1 items-center justify-center gap-8">
      <h1 className="text-4xl font-bold">Codescape</h1>
      <p className="text-zinc-500 text-lg">Visualize your code as a city</p>
      <button
        onClick={signInWithGitHub}
        className="rounded-full bg-zinc-900 text-white px-6 py-3 font-medium hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200 transition-colors"
      >
        Sign in with GitHub
      </button>
    </div>
  )
}
