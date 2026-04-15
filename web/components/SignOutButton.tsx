'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Props = {
  className?: string
  children?: React.ReactNode
}

export default function SignOutButton({
  className = 'rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[#4B5563] transition hover:bg-[#F3F4F6]',
  children = 'Sign out',
}: Props) {
  const router = useRouter()

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.refresh()
    router.push('/')
  }

  return (
    <button onClick={signOut} className={className}>
      {children}
    </button>
  )
}
