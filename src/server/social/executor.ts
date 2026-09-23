import {randomUUID} from 'node:crypto'
import {context, reddit, redis} from '@devvit/web/server'
import {getSocialOsState, setSocialOsState} from '../db.ts'
import type {ActionEnvelope} from './action.ts'
import {duplicate, gateGenerated} from './core.ts'
import {governanceGate} from './governance.ts'

const ACTION_RETENTION_DAYS = 90

function bucket(now = new Date()): {day: string; hour: string} {
  return {
    day: now.toISOString().slice(0, 10),
    hour: now.toISOString().slice(0, 13),
  }
}

async function count(key: string): Promise<number> {
  return Number((await redis.get(key)) ?? '0')
}

export async function executeAppAction(
  envelope: ActionEnvelope,
  options: {
    fatigue?: number
    moderationRisk: boolean
    researchRequired: boolean
    researchVerified: boolean
  },
): Promise<{executed: boolean; reason: string; redditId?: string}> {
  if (envelope.identity !== 'APP')
    return {executed: false, reason: 'USER action requires explicit queue'}
  if (
    !context.subredditName ||
    envelope.subreddit.toLowerCase() !== context.subredditName.toLowerCase()
  )
    return {
      executed: false,
      reason: 'APP actions are limited to the installed subreddit',
    }

  const lockKey = 'social-os:execution-lock'
  const lockToken = randomUUID()
  await redis.set(lockKey, lockToken, {
    nx: true,
    expiration: new Date(Date.now() + 2 * 60_000),
  })
  if ((await redis.get(lockKey)) !== lockToken)
    return {executed: false, reason: 'another action is in progress'}

  try {
    const state = await getSocialOsState()
    const idem = `social-os:executed:${envelope.idempotencyKey}`
    if (await redis.get(idem))
      return {executed: false, reason: 'idempotent replay'}

    const b = bucket()
    const hourKey = `social-os:budget:hour:${b.hour}`
    const dayKey = `social-os:budget:day:${b.day}`
    const authorKey = `social-os:fatigue:author:${b.day}:${(envelope.author ?? 'unknown').toLowerCase()}`
    const threadKey = `social-os:fatigue:thread:${b.day}:${envelope.targetId ?? 'original'}`
    const topicKey = `social-os:fatigue:topic:${b.day}:${envelope.topic ?? 'unknown'}`
    const recentKey = 'social-os:recent-actions'
    const recent = parseRecent(await redis.get(recentKey))
    const measuredFatigue = Math.max(
      options.fatigue ?? 0,
      (await count(authorKey)) >= 2 ? 1 : 0,
      (await count(threadKey)) >= 2 ? 1 : 0,
      (await count(topicKey)) >= 3 ? 1 : 0,
    )
    const gate = governanceGate({
      enabled: state.enabled,
      mode: state.mode,
      failures: state.failures,
      paused: false,
      duplicate: duplicate(
        envelope.body,
        recent.map(item => item.body),
      ),
      fatigue: measuredFatigue,
      moderationRisk: options.moderationRisk,
      researchRequired: options.researchRequired,
      researchVerified: options.researchVerified,
      actionsToday: await count(dayKey),
      actionsThisHour: await count(hourKey),
    })
    if (!gate.allow) return {executed: false, reason: gate.reason}

    const [safe, reason] = gateGenerated(
      envelope.body,
      options.researchVerified ? 'verified' : '',
    )
    if (!safe) return {executed: false, reason}
    if (envelope.action === 'POST' && !envelope.title?.trim())
      return {executed: false, reason: 'post title required'}

    const pending = `pending:${lockToken}`
    await redis.set(idem, pending, {
      nx: true,
      expiration: expiresInDays(ACTION_RETENTION_DAYS),
    })
    if ((await redis.get(idem)) !== pending)
      return {executed: false, reason: 'idempotent replay'}

    let redditId = ''
    try {
      redditId = await submitWithRateLimitRetry(envelope)
    } catch (error) {
      await redis.set(idem, `failed-uncertain:${new Date().toISOString()}`, {
        expiration: expiresInDays(ACTION_RETENTION_DAYS),
      })
      throw error
    }

    await redis.set(idem, redditId || 'complete', {
      expiration: expiresInDays(ACTION_RETENTION_DAYS),
    })
    await redis.set(`social-os:owned:${redditId}`, envelope.action, {
      expiration: expiresInDays(365),
    })
    await incrementWithExpiry(hourKey, 2 * 24 * 60 * 60)
    await incrementWithExpiry(dayKey, 2 * 24 * 60 * 60)
    await incrementWithExpiry(authorKey, 2 * 24 * 60 * 60)
    await incrementWithExpiry(threadKey, 2 * 24 * 60 * 60)
    await incrementWithExpiry(topicKey, 2 * 24 * 60 * 60)
    recent.unshift({body: envelope.body, at: new Date().toISOString()})
    await redis.set(recentKey, JSON.stringify(recent.slice(0, 50)), {
      expiration: expiresInDays(30),
    })
    await redis.set(
      `social-os:audit:${envelope.idempotencyKey}`,
      JSON.stringify({
        at: new Date().toISOString(),
        action: envelope.action,
        subreddit: envelope.subreddit,
        targetId: envelope.targetId,
        redditId,
        identity: 'APP',
      }),
      {expiration: expiresInDays(ACTION_RETENTION_DAYS)},
    )

    const current = await getSocialOsState()
    await setSocialOsState({
      ...current,
      actions: current.actions + 1,
      canaryActions:
        current.canaryActions + (current.mode === 'CANARY' ? 1 : 0),
      liveActions: current.liveActions + (current.mode === 'LIVE' ? 1 : 0),
      lastActionAt: new Date().toISOString(),
    })
    return {executed: true, reason: 'executed', redditId}
  } finally {
    if ((await redis.get(lockKey)) === lockToken) await redis.del(lockKey)
  }
}

async function submitWithRateLimitRetry(
  envelope: ActionEnvelope,
): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (envelope.action === 'COMMENT' && envelope.targetId) {
        const comment = await reddit.submitComment({
          id: envelope.targetId as `t1_${string}` | `t3_${string}`,
          text: envelope.body,
          runAs: 'APP',
        })
        return comment.id
      }
      if (envelope.action === 'POST' && envelope.title) {
        const post = envelope.mediaUrl
          ? await reddit.submitPost({
              subredditName: envelope.subreddit,
              title: envelope.title,
              richtext: {
                document: [
                  {e: 'par', c: [{e: 'text', t: envelope.body}]},
                  {
                    e: 'par',
                    c: [
                      {
                        e: 'img',
                        mediaUrl: envelope.mediaUrl,
                        c: envelope.mediaAlt ?? 'Generated illustration',
                      },
                    ],
                  },
                ],
              },
              runAs: 'APP',
            })
          : await reddit.submitPost({
              subredditName: envelope.subreddit,
              title: envelope.title,
              text: envelope.body,
              runAs: 'APP',
            })
        return post.id
      }
      throw new Error('invalid executable action')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (attempt === 0 && /\b429\b|rate.?limit/i.test(message)) {
        await new Promise(resolve => setTimeout(resolve, 1_000))
        continue
      }
      throw error
    }
  }
  throw new Error('Reddit action failed')
}

async function incrementWithExpiry(
  key: string,
  seconds: number,
): Promise<void> {
  await redis.incrBy(key, 1)
  await redis.expire(key, seconds)
}

function parseRecent(
  raw: string | undefined,
): Array<{body: string; at: string}> {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value)
      ? value.filter(
          item =>
            item &&
            typeof item === 'object' &&
            typeof item.body === 'string' &&
            typeof item.at === 'string',
        )
      : []
  } catch {
    return []
  }
}

const expiresInDays = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000)
