import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { formatDistanceToNow } from 'date-fns'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateQueueStatus } from '../../actions'
import ReviewActions from './ReviewActions'
import SignOutButton from '../../SignOutButton'

const CIRCUMFERENCE = 2 * Math.PI * 40

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-yellow-900/40 text-yellow-300',
  reviewing: 'bg-cyan-900/40 text-cyan-300',
  verified: 'bg-emerald-900/40 text-emerald-300',
  rejected:  'bg-red-900/40 text-red-400',
}

function ScoreRing({ score }: { score: number | null }) {
  if (score === null) return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-28 h-28 rounded-full border-4 border-ale-border flex items-center justify-center text-ale-muted">
        —
      </div>
      <span className="text-xs text-ale-muted italic">No score yet</span>
    </div>
  )

  const offset = CIRCUMFERENCE * (1 - score / 100)
  const color  = score >= 70 ? '#00C875' : score >= 40 ? '#F0A020' : '#E03050'
  const label  = score >= 70 ? 'Pure ALE' : score >= 40 ? 'Mixed Pour' : 'Skunked'

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#1E2830" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="40" fill="none"
            stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-[#E8DCC8]">
          {Math.round(score)}%
        </div>
      </div>
      <span className="text-sm italic font-medium" style={{ color }}>{label}</span>
    </div>
  )
}

function SignalBar({
  label,
  value,
  danger = false,
}: {
  label: string
  value: number | null
  danger?: boolean
}) {
  if (value == null) return null
  const pct   = Math.round(value * 100)
  const color = danger
    ? pct < 15 ? '#00C875' : pct < 40 ? '#F0A020' : '#E03050'
    : pct > 85 ? '#00C875' : pct > 60 ? '#F0A020' : '#E03050'

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-ale-muted">{label}</span>
        <span className="tabular-nums font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 bg-ale-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}

function getThumbnailUrl(url: string, videoId: string | null): string | null {
  if (videoId && url.includes('youtube.com')) {
    return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
  }
  return null
}

export default async function ReviewPage({ params }: { params: { id: string } }) {
  const [item, session] = await Promise.all([
    prisma.brewmasterQueue.findUnique({
      where: { id: params.id },
      include: { analysis: true },
    }),
    getServerSession(authOptions),
  ])

  if (!item) notFound()

  // Mark as reviewing on first open if still pending
  if (item.status === 'pending') {
    await updateQueueStatus(item.id, 'reviewing')
    item.status = 'reviewing'
  }

  const details  = (item.analysis?.rawResult as any)?.details ?? {}
  const thumb    = getThumbnailUrl(item.url, item.videoId)

  let hostname = item.url
  try { hostname = new URL(item.url).hostname.replace('www.', '') } catch {}

  return (
    <div className="min-h-screen bg-ale-bg">
      {/* Header */}
      <header className="border-b border-ale-border bg-ale-card px-6 py-4 flex items-center justify-between">
        {/* Left — brand */}
        <div className="flex items-center gap-2">
          <img src="/ale-icon.png" alt="ALE" width={28} height={28} className="rounded"
            style={{ filter: 'drop-shadow(0 0 6px rgba(232,160,32,0.45))' }} />
          <div>
            <span className="font-bold tracking-widest text-ale-amber">ALE</span>
            <p className="text-xs text-ale-muted italic leading-none">The Brewery</p>
          </div>
        </div>

        {/* Center — nav + title */}
        <div className="flex items-center gap-3">
          <Link
            href="/brewery"
            className="text-ale-muted hover:text-ale-amber transition-colors text-sm"
          >
            ← Queue
          </Link>
          <div className="h-4 w-px bg-ale-border" />
          <span className="text-sm text-[#E8DCC8] font-medium">Review</span>
        </div>

        {/* Right — session + sign out */}
        <div className="flex items-center gap-4">
          <span className="text-xs text-ale-muted">{session?.user?.email}</span>
          <SignOutButton />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Top: thumbnail + meta | score + signals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Left — preview & metadata */}
          <div className="bg-ale-card border border-ale-border rounded-lg overflow-hidden">
            {thumb ? (
              <img src={thumb} alt="Video thumbnail" className="w-full object-cover" />
            ) : (
              <div className="w-full h-36 bg-ale-border/30 flex items-center justify-center text-ale-muted text-xs italic">
                No preview available
              </div>
            )}
            <div className="p-4 space-y-3">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ale-amber hover:text-ale-gold underline underline-offset-2 text-sm break-all leading-relaxed"
              >
                {item.url}
              </a>
              <div className="flex flex-wrap gap-2 items-center">
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status] ?? ''}`}>
                  {item.status}
                </span>
                <span className="text-xs text-ale-muted">
                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                </span>
              </div>
            </div>
          </div>

          {/* Right — score ring + signal bars */}
          <div className="bg-ale-card border border-ale-border rounded-lg p-6 space-y-6">
            <div className="flex justify-center">
              <ScoreRing score={item.analysis?.realityScore ?? null} />
            </div>

            {Object.values(details).some((v) => v != null) && (
              <div className="space-y-4 pt-2 border-t border-ale-border">
                <p className="text-xs uppercase tracking-wider text-ale-muted">Hive Signals</p>
                <SignalBar label="Not AI Generated"    value={details.not_ai_generated}    danger={false} />
                <SignalBar label="AI Generated"        value={details.ai_generated}         danger={true}  />
                <SignalBar label="Deepfake (visual)"   value={details.deepfake}             danger={true}  />
                {details.ai_generated_audio != null && (
                  <SignalBar label="AI Generated (audio)" value={details.ai_generated_audio} danger={true} />
                )}
              </div>
            )}

            {!item.analysis && (
              <p className="text-xs text-ale-muted italic text-center pt-2 border-t border-ale-border">
                No AI analysis linked to this queue item.
              </p>
            )}
          </div>
        </div>

        {/* Notes + actions */}
        <div className="bg-ale-card border border-ale-border rounded-lg p-6">
          <ReviewActions
            id={item.id}
            currentStatus={item.status}
            existingNotes={item.notes}
          />
        </div>

      </main>
    </div>
  )
}
