'use client'
import { signOut } from 'next-auth/react'

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="text-xs text-ale-muted hover:text-ale-amber transition-colors"
    >
      Sign out
    </button>
  )
}
