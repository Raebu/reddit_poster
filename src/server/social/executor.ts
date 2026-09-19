import {reddit, redis} from '@devvit/web/server'
import {getSocialOsState, setSocialOsState} from '../db.ts'
import type {ActionEnvelope} from './action.ts'
import {gateGenerated} from './core.ts'
import {governanceGate} from './governance.ts'

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
    fatigue: number
    moderationRisk: boolean
    researchRequired: boolean
    researchVerified: boolean
  },
): Promise<{executed: boolean; reason: string; redditId?: string}> {
  const state = await getSocialOsState()
  const idem = `social-os:executed:${envelope.idempotencyKey}`
  if (await redis.get(idem))
    return {executed: false, reason: 'idempotent replay'}

  const b = bucket()
  const hourKey = `social-os:budget:hour:${b.hour}`
  const dayKey = `social-os:budget:day:${b.day}`
  const gate = governanceGate({
    enabled: state.enabled,
    mode: state.mode,
    failures: state.failures,
    paused: false,
    duplicate: false,
    fatigue: options.fatigue,
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

  let redditId = ''
  if (envelope.action === 'COMMENT' && envelope.targetId) {
    const comment = await reddit.submitComment({
      id: envelope.targetId as `t1_${string}` | `t3_${string}`,
      text: envelope.body,
      runAs: 'APP',
    })
    redditId = comment.id
  } else if (envelope.action === 'POST' && envelope.title) {
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
    redditId = post.id
  } else return {executed: false, reason: 'invalid executable action'}

  await redis.set(idem, redditId || '1')
  await redis.set(hourKey, String((await count(hourKey)) + 1))
  await redis.set(dayKey, String((await count(dayKey)) + 1))

  const next = {
    ...state,
    actions: state.actions + 1,
    canaryActions: state.canaryActions + (state.mode === 'CANARY' ? 1 : 0),
    liveActions: state.liveActions + (state.mode === 'LIVE' ? 1 : 0),
    lastActionAt: new Date().toISOString(),
  }
  await setSocialOsState(next)
  return {executed: true, reason: 'executed', redditId}
}
