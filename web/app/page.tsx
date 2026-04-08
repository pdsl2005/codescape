'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { importUserRepos } from '@/lib/repos'

export default function Home() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setLoading(false)

      if (event === 'SIGNED_IN' && session) {
        const githubToken = session.provider_token
        const userId = session.user.id
        if (githubToken) {
          setTimeout(() => {
            void importUserRepos(githubToken, userId).catch((err) => {
              console.error('importUserRepos failed:', err)
            })
          }, 0)
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!loading && session) {
      router.push('/dashboard')
    }
  }, [loading, session, router])

  const signInWithGitHub = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin,
      },
    })
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    )
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
