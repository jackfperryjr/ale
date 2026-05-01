import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { updateQueueStatus } from './actions'
import SignOutButton from './SignOutButton'

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-yellow-900/40 text-yellow-300',
  reviewing: 'bg-cyan-900/40 text-cyan-300',
  verified: 'bg-emerald-900/40 text-emerald-300',
  rejected:  'bg-red-900/40 text-red-400',
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-ale-muted">—</span>
  const color = score >= 70 ? 'text-ale-real' : score >= 40 ? 'text-ale-mixed' : 'text-ale-skunked'
  const label = score >= 70 ? 'Pure ALE' : score >= 40 ? 'Mixed' : 'Skunked'
  return (
    <span className={`font-bold tabular-nums ${color}`}>
      {Math.round(score)}%{' '}
      <span className="font-normal italic text-xs">{label}</span>
    </span>
  )
}

function truncate(url: string, n = 52) {
  try {
    const { hostname, pathname } = new URL(url)
    const short = hostname.replace('www.', '') + pathname
    return short.length > n ? short.slice(0, n) + '…' : short
  } catch {
    return url.length > n ? url.slice(0, n) + '…' : url
  }
}

export default async function BreweryPage() {
  const session = await getServerSession(authOptions)

  const [pending, reviewing, recentScans, stats] = await Promise.all([
    prisma.brewmasterQueue.findMany({
      where: { status: 'pending' },
      include: { analysis: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.brewmasterQueue.findMany({
      where: { status: 'reviewing' },
      include: { analysis: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.analysis.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        queueItems: {
          where: { status: { in: ['verified', 'rejected'] } },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    }),
    prisma.$transaction([
      prisma.brewmasterQueue.count({ where: { status: { in: ['pending', 'reviewing'] } } }),
      prisma.brewmasterQueue.count({ where: { status: 'verified' } }),
      prisma.analysis.count(),
    ]),
  ])

  const [pendingCount, verifiedCount, totalAnalyses] = stats
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

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-10">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'In Queue',        value: pendingCount,    color: 'text-yellow-300' },
            { label: 'Verified',        value: verifiedCount,  color: 'text-ale-real'   },
            { label: 'Total AI Scans',  value: totalAnalyses,   color: 'text-ale-amber'  },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-ale-card border border-ale-border rounded-lg p-4 text-center">
              <div className={`text-3xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-ale-muted mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* ── Brewmaster Queue ────────────────────────────────── */}
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-ale-amber">Brewmaster Queue</h2>
            <p className="text-xs text-ale-muted mt-0.5">
              Content flagged by users for human sign-off. Verify to mark content as authentic; reject to mark it synthetic.
            </p>
          </div>

          {queue.length === 0 ? (
            <div className="bg-ale-card border border-ale-border rounded-lg px-5 py-8 text-center text-ale-muted italic text-sm">
              Queue is empty — nothing waiting for review.
            </div>
          ) : (
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
                      <td className="px-4 py-3 text-ale-muted text-xs">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[item.status] ?? ''}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <Link
                            href={`/brewery/review/${item.id}`}
                            className="text-xs px-3 py-1 border border-ale-border rounded hover:border-ale-amber text-ale-muted hover:text-ale-amber transition-colors"
                          >
                            Details →
                          </Link>
                          <form action={async () => {
                            'use server'
                            await updateQueueStatus(item.id, 'verified')
                          }}>
                            <button
                              title="Mark content as authentic — issues a human verification"
                              className="text-xs px-3 py-1 bg-ale-real/10 border border-ale-real/30 text-ale-real rounded hover:bg-ale-real/20 transition-colors"
                            >
                              Verify
                            </button>
                          </form>
                          <form action={async () => {
                            'use server'
                            await updateQueueStatus(item.id, 'rejected')
                          }}>
                            <button
                              title="Mark as synthetic or unverifiable"
                              className="text-xs px-3 py-1 bg-ale-skunked/10 border border-ale-skunked/30 text-ale-skunked rounded hover:bg-ale-skunked/20 transition-colors"
                            >
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

        {/* ── Recent AI Scans ───────────────────────────────────── */}
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-ale-amber">Recent AI Scans</h2>
            <p className="text-xs text-ale-muted mt-0.5">
              Every URL the extension has run through Hive. High scores are likely real; low scores may warrant a closer look.
            </p>
          </div>

          {recentScans.length === 0 ? (
            <div className="bg-ale-card border border-ale-border rounded-lg px-5 py-8 text-center text-ale-muted italic text-sm">
              No scans yet — use the extension on a YouTube or X video to see results here.
            </div>
          ) : (
            <div className="bg-ale-card border border-ale-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ale-border text-ale-muted text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">URL</th>
                    <th className="text-left px-4 py-3">Score</th>
                    <th className="text-left px-4 py-3">AI Generated</th>
                    <th className="text-left px-4 py-3">Deepfake</th>
                    <th className="text-left px-4 py-3">Brewmaster</th>
                    <th className="text-left px-4 py-3">Notes</th>
                    <th className="text-left px-4 py-3">Scanned</th>
                  </tr>
                </thead>
                <tbody>
                  {recentScans.map((scan) => {
                    const details = (scan.rawResult as any)?.details ?? {}
                    const review  = scan.queueItems[0] ?? null
                    return (
                      <tr key={scan.id} className="border-b border-ale-border last:border-0 hover:bg-ale-amber/5 transition-colors">
                        <td className="px-4 py-3 max-w-xs">
                          <a
                            href={scan.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ale-amber hover:text-ale-gold underline underline-offset-2"
                            title={scan.url}
                          >
                            {truncate(scan.url)}
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <ScoreBadge score={scan.realityScore} />
                        </td>
                        <td className="px-4 py-3 text-ale-muted tabular-nums text-xs">
                          {details.ai_generated != null
                            ? `${Math.round(details.ai_generated * 100)}%`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-ale-muted tabular-nums text-xs">
                          {details.deepfake != null
                            ? `${Math.round(details.deepfake * 100)}%`
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {review ? (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[review.status] ?? ''}`}>
                              {review.status}
                            </span>
                          ) : (
                            <span className="text-ale-muted text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-ale-muted text-xs max-w-[180px]">
                          {review?.notes
                            ? <span title={review.notes}>{truncate(review.notes, 40)}</span>
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-ale-muted text-xs">
                          {formatDistanceToNow(new Date(scan.createdAt), { addSuffix: true })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </main>
    </div>
  )
}
