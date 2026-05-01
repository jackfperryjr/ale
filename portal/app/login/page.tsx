import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import SignInButton from './SignInButton'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const session = await getServerSession(authOptions)
  if (session) redirect('/brewery')

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-3">
          <img
            src="/ale-icon.png"
            alt="ALE"
            width={98}
            height={98}
            className="rounded"
            style={{ filter: 'drop-shadow(0 0 8px rgba(232, 160, 32, 0.5))' }}
          />
          
        <h1 className="text-5xl font-bold tracking-widest text-ale-amber">ALE</h1>
        <p className="text-ale-muted italic mt-1">The Brewery</p>
      </div>

      <div className="bg-ale-card border border-ale-border rounded-lg p-8 w-80 flex flex-col items-center gap-4">
        <p className="text-sm text-ale-muted text-center">
          Sign in with your Google account to access the brewmaster dashboard.
        </p>

        <SignInButton />

        {searchParams.error && (
          <p className="text-xs text-ale-skunked text-center">
            Access denied. Your account is not on the allowed list.
          </p>
        )}
      </div>
    </main>
  )
}
