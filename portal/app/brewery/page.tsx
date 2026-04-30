import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatDistanceToNow } from 'date-fns'
import { updateQueueStatus } from './actions'
import SignOutButton from './SignOutButton'

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-yellow-900/40 text-yellow-300',
  reviewing: 'bg-cyan-900/40 text-cyan-300',
  certified: 'bg-emerald-900/40 text-emerald-300',
  rejected:  'bg-red-900/40 text-red-400',
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-ale-muted">—</span>
  const color = score >= 70 ? 'text-ale-real' : score >= 40 ? 'text-ale-mixed' : 'text-ale-skunked'
  const label = score >= 70 ? 'Pure ALE' : score >= 40 ? 'Mixed' : 'Skunked'
  return (
    <span className={`font-bold ${color}`}>
      {Math.round(score)}% <span className="font-normal italic text-xs">{label}</span>
    </span>
  )
}

function truncate(url: string, n = 55) {
  return url.length > n ? url.slice(0, n) + '…' : url
}

export default async function BreweryPage() {
  const session = await getServerSession(authOptions)

  const [pending, reviewing, stats] = await Promise.all([
    prisma.notaryQueue.findMany({
      where: { status: 'pending' },
      include: { analysis: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.notaryQueue.findMany({
      where: { status: 'reviewing' },
      include: { analysis: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.$transaction([
      prisma.notaryQueue.count({ where: { status: 'pending' } }),
      prisma.notaryQueue.count({ where: { status: 'certified' } }),
      prisma.analysis.count(),
    ]),
  ])

  const [pendingCount, certifiedCount, totalAnalyses] = stats
  const queue = [...reviewing, ...pending]

  return (
    <div className="min-h-screen bg-ale-bg">
      {/* Header */}
      <header className="border-b border-ale-border bg-ale-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/ale-icon.png"
            alt="ALE"
            width={36}
            height={36}
            className="rounded"
            style={{ filter: 'drop-shadow(0 0 8px rgba(232, 160, 32, 0.5))' }}
          />
          <div>
            <h1 className="text-2xl font-bold tracking-widest text-ale-amber">ALE</h1>
            <p className="text-xs text-ale-muted italic">The Brewery</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-ale-muted">{session?.user?.email}</span>
          <SignOutButton />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Pending Review', value: pendingCount, color: 'text-yellow-300' },
            { label: 'Certified',      value: certifiedCount, color: 'text-ale-real' },
            { label: 'Total Analyses', value: totalAnalyses, color: 'text-ale-amber' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-ale-card border border-ale-border rounded-lg p-4 text-center">
              <div className={`text-3xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-ale-muted mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Queue */}
        <section>
          <h2 className="text-lg font-bold text-ale-amber mb-3">
            Notary Queue
            {queue.length === 0 && (
              <span className="ml-3 text-sm font-normal text-ale-muted italic">
                — all clear, nothing pending
              </span>
            )}
          </h2>

          {queue.length > 0 && (
            <div className="bg-ale-card border border-ale-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ale-border text-ale-muted text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">URL</th>
                    <th className="text-left px-4 py-3">AI Score</th>
                    <th className="text-left px-4 py-3">Submitted</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((item) => (
                    <tr key={item.id} className="border-b border-ale-border last:border-0 hover:bg-ale-amber/5 transition-colors">
                      <td className="px-4 py-3 max-w-xs">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ale-amber hover:text-ale-gold underline underline-offset-2"
                          title={item.url}
                        >
                          {truncate(item.url)}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <ScoreBadge score={item.analysis?.realityScore ?? null} />
                      </td>
                      <td className="px-4 py-3 text-ale-muted">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[item.status] ?? ''}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          {item.status === 'pending' && (
                            <form action={async () => {
                              'use server'
                              await updateQueueStatus(item.id, 'reviewing')
                            }}>
                              <button className="text-xs px-3 py-1 border border-ale-border rounded hover:border-ale-amber text-ale-muted hover:text-ale-amber transition-colors">
                                Review
                              </button>
                            </form>
                          )}
                          <form action={async () => {
                            'use server'
                            await updateQueueStatus(item.id, 'certified')
                          }}>
                            <button className="text-xs px-3 py-1 bg-ale-real/10 border border-ale-real/30 text-ale-real rounded hover:bg-ale-real/20 transition-colors">
                              Certify
                            </button>
                          </form>
                          <form action={async () => {
                            'use server'
                            await updateQueueStatus(item.id, 'rejected')
                          }}>
                            <button className="text-xs px-3 py-1 bg-ale-skunked/10 border border-ale-skunked/30 text-ale-skunked rounded hover:bg-ale-skunked/20 transition-colors">
                              Reject
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
