import {reddit, redis} from '@devvit/web/server'
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

export async function approveUserAction(
  idempotencyKey: string,
): Promise<UserQueueItem> {
  const key = `social-os:user-queue:${idempotencyKey}`
  const raw = await redis.get(key)
  if (!raw) throw new Error('queued action not found')
  const item = JSON.parse(raw) as UserQueueItem
  if (item.status !== 'PENDING') return item

  if (item.action === 'COMMENT' && item.targetId) {
    await reddit.submitComment({
      id: item.targetId as `t1_${string}` | `t3_${string}`,
      text: item.body,
      runAs: 'USER',
    })
  } else if (item.action === 'POST' && item.title) {
    await reddit.submitPost({
      subredditName: item.subreddit,
      title: item.title,
      text: item.body,
      runAs: 'USER',
    })
  } else throw new Error('invalid queued USER action')

  const approved = {...item, status: 'APPROVED' as const}
  await redis.set(key, JSON.stringify(approved))
  return approved
}

export async function dismissUserAction(
  idempotencyKey: string,
): Promise<UserQueueItem> {
  const key = `social-os:user-queue:${idempotencyKey}`
  const raw = await redis.get(key)
  if (!raw) throw new Error('queued action not found')
  const item = JSON.parse(raw) as UserQueueItem
  const dismissed = {...item, status: 'DISMISSED' as const}
  await redis.set(key, JSON.stringify(dismissed))
  return dismissed
}
