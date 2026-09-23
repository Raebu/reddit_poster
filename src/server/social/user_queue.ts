import {randomUUID} from 'node:crypto'
import {context, reddit, redis} from '@devvit/web/server'
import type {ActionEnvelope} from './action.ts'

export type UserQueueItem = ActionEnvelope & {
  queuedAt: string
  status:
    | 'PENDING'
    | 'EXECUTING'
    | 'APPROVED'
    | 'DISMISSED'
    | 'FAILED_UNCERTAIN'
  completedAt?: string
}

const INDEX = 'social-os:user-queue:index'
const expiresInDays = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000)

export async function enqueueUserAction(
  envelope: ActionEnvelope,
): Promise<UserQueueItem> {
  if (envelope.identity !== 'USER' || !envelope.requestedBy)
    throw new Error('USER queue item must be bound to a requesting user')
  const item: UserQueueItem = {
    ...envelope,
    queuedAt: new Date().toISOString(),
    status: 'PENDING',
  }
  await redis.set(
    `social-os:user-queue:${envelope.idempotencyKey}`,
    JSON.stringify(item),
    {nx: true, expiration: expiresInDays(30)},
  )
  const raw = await redis.get(INDEX)
  const index = parseIndex(raw)
  if (!index.includes(envelope.idempotencyKey))
    index.unshift(envelope.idempotencyKey)
  await redis.set(INDEX, JSON.stringify(index.slice(0, 100)), {
    expiration: expiresInDays(30),
  })
  return item
}

export async function listUserQueue(): Promise<UserQueueItem[]> {
  if (!context.userId) return []
  const raw = await redis.get(INDEX)
  const out: UserQueueItem[] = []
  for (const key of parseIndex(raw)) {
    const item = await redis.get(`social-os:user-queue:${key}`)
    if (!item) continue
    try {
      const parsed = JSON.parse(item) as UserQueueItem
      if (parsed.requestedBy?.id === context.userId) out.push(parsed)
    } catch {
      // Corrupt queue entries fail closed and are omitted.
    }
  }
  return out
}

export async function approveUserAction(
  idempotencyKey: string,
): Promise<UserQueueItem> {
  const actor = currentActor()
  const key = `social-os:user-queue:${idempotencyKey}`
  const lockKey = `${key}:approval-lock`
  const token = randomUUID()
  await redis.set(lockKey, token, {
    nx: true,
    expiration: new Date(Date.now() + 2 * 60_000),
  })
  if ((await redis.get(lockKey)) !== token)
    throw new Error('queued action approval already in progress')

  try {
    const raw = await redis.get(key)
    if (!raw) throw new Error('queued action not found')
    const item = JSON.parse(raw) as UserQueueItem
    assertActor(item, actor)
    if (item.status !== 'PENDING') return item
    if (
      !context.subredditName ||
      item.subreddit.toLowerCase() !== context.subredditName.toLowerCase()
    )
      throw new Error('USER actions are limited to the current subreddit')

    const executing = {...item, status: 'EXECUTING' as const}
    await redis.set(key, JSON.stringify(executing), {
      expiration: expiresInDays(30),
    })
    try {
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
    } catch (error) {
      await redis.set(
        key,
        JSON.stringify({
          ...item,
          status: 'FAILED_UNCERTAIN',
          completedAt: new Date().toISOString(),
        } satisfies UserQueueItem),
        {
          expiration: expiresInDays(30),
        },
      )
      throw error
    }

    const approved = {
      ...item,
      status: 'APPROVED' as const,
      completedAt: new Date().toISOString(),
    }
    await redis.set(key, JSON.stringify(approved), {
      expiration: expiresInDays(30),
    })
    return approved
  } finally {
    if ((await redis.get(lockKey)) === token) await redis.del(lockKey)
  }
}

export async function dismissUserAction(
  idempotencyKey: string,
): Promise<UserQueueItem> {
  const actor = currentActor()
  const key = `social-os:user-queue:${idempotencyKey}`
  const raw = await redis.get(key)
  if (!raw) throw new Error('queued action not found')
  const item = JSON.parse(raw) as UserQueueItem
  assertActor(item, actor)
  if (item.status !== 'PENDING') return item
  const dismissed = {
    ...item,
    status: 'DISMISSED' as const,
    completedAt: new Date().toISOString(),
  }
  await redis.set(key, JSON.stringify(dismissed), {
    expiration: expiresInDays(30),
  })
  return dismissed
}

function currentActor(): {id: string; username: string} {
  if (!context.userId || !context.username)
    throw new Error('logged-in user required')
  return {id: context.userId, username: context.username}
}

function assertActor(
  item: UserQueueItem,
  actor: {id: string; username: string},
): void {
  if (
    !item.requestedBy ||
    item.requestedBy.id !== actor.id ||
    item.requestedBy.username.toLowerCase() !== actor.username.toLowerCase()
  )
    throw new Error('queued action belongs to a different user')
}

function parseIndex(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value)
      ? value.filter(item => typeof item === 'string')
      : []
  } catch {
    return []
  }
}
