'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'

export async function updateQueueStatus(id: string, status: string, notes?: string) {
  await prisma.brewmasterQueue.update({
    where: { id },
    data: { status, notes: notes ?? null },
  })
  revalidatePath('/brewery')
  revalidatePath(`/brewery/review/${id}`)
}

