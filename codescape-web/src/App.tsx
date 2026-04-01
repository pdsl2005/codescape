import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { Session } from '@supabase/supabase-js'
import { importUserRepos } from './lib/repos'

function App() {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    // Get current session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // Listen for auth changes. Do not await Supabase (or other supabase.* calls) inside this
    // callback — it can deadlock the auth lock while OAuth completes. Defer import instead.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)

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

  const signInWithGitHub = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin
      }
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  if (!session) {
    return (
      <div>
        <h1>Codescape</h1>
        <button onClick={signInWithGitHub}>Sign in with GitHub</button>
      </div>
    )
  }

  return (
    <div>
      <h1>Codescape</h1>
      <p>Signed in as {session.user.user_metadata.user_name}</p>
      <button onClick={signOut}>Sign out</button>
    </div>
  )
}

export default App