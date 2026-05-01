'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateQueueStatus } from '../../actions'

export default function ReviewActions({
  id,
  currentStatus,
  existingNotes,
}: {
  id: string
  currentStatus: string
  existingNotes: string | null
}) {
  const [notes, setNotes] = useState(existingNotes ?? '')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const done = currentStatus === 'verified' || currentStatus === 'rejected'

  function submit(status: string) {
    startTransition(async () => {
      await updateQueueStatus(id, status, notes)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-wider text-ale-muted">
          Brewmaster Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={done || isPending}
          placeholder="Add observations, reasoning, or references…"
          rows={4}
          className="
            w-full bg-ale-bg border border-ale-border rounded px-3 py-2
            text-sm text-[#E8DCC8] placeholder:text-ale-muted
            focus:outline-none focus:border-ale-amber
            disabled:opacity-50 disabled:cursor-not-allowed
            resize-none transition-colors
          "
        />
      </div>

      {done ? (
        <p className="text-sm italic text-ale-muted text-center">
          This item has been <span className="text-[#E8DCC8] font-medium">{currentStatus}</span>.
        </p>
      ) : (
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => submit('rejected')}
            disabled={isPending}
            className="
              px-5 py-2 rounded text-sm font-medium
              bg-ale-skunked/10 border border-ale-skunked/40 text-ale-skunked
              hover:bg-ale-skunked/20 disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors
            "
          >
            {isPending ? '…' : 'Reject'}
          </button>
          <button
            onClick={() => submit('verified')}
            disabled={isPending}
            className="
              px-5 py-2 rounded text-sm font-medium
              bg-ale-real/10 border border-ale-real/40 text-ale-real
              hover:bg-ale-real/20 disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors
            "
          >
            {isPending ? '…' : 'Verify ✓'}
          </button>
        </div>
      )}
    </div>
  )
}
