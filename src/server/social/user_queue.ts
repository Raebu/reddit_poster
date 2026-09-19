import {redis} from '@devvit/web/server'
import type {ActionEnvelope} from './action.ts'

export type UserQueueItem = ActionEnvelope & {
  queuedAt: string
  status: 'PENDING' | 'APPROVED' | 'DISMISSED'
}

const INDEX = 'social-os:user-queue:index'

export async function enqueueUserAction(
  envelope: ActionEnvelope,
): Promise<UserQueueItem> {
  const item: UserQueueItem = {
    ...envelope,
    queuedAt: new Date().toISOString(),
    status: 'PENDING',
  }
  await redis.set(
    `social-os:user-queue:${envelope.idempotencyKey}`,
    JSON.stringify(item),
  )
  const raw = await redis.get(INDEX)
  const index = raw ? (JSON.parse(raw) as string[]) : []
  if (!index.includes(envelope.idempotencyKey))
    index.unshift(envelope.idempotencyKey)
  await redis.set(INDEX, JSON.stringify(index.slice(0, 100)))
  return item
}

export async function listUserQueue(): Promise<UserQueueItem[]> {
  const raw = await redis.get(INDEX)
  const index = raw ? (JSON.parse(raw) as string[]) : []
  const out: UserQueueItem[] = []
  for (const key of index) {
    const item = await redis.get(`social-os:user-queue:${key}`)
    if (item) out.push(JSON.parse(item) as UserQueueItem)
  }
  return out
}
