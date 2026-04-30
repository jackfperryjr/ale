import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function Home() {
  if (process.env.SKIP_AUTH === 'true') redirect('/brewery')
  const session = await getServerSession(authOptions)
  if (session) redirect('/brewery')
  redirect('/login')
}
