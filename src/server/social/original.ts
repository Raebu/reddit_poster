import {context, redis} from '@devvit/web/server'
import {getSocialOsState} from '../db.ts'
import {canParticipate} from './core.ts'
import {executeAppAction} from './executor.ts'
import {generateOriginalPost} from './llm.ts'
import {generateAndUploadImage, mediaPlan} from './media.ts'
import {putConversation} from './memory.ts'

const TOPICS = [
  'technology_ai',
  'entrepreneurship_building',
  'strategy_economics',
  'transformation_execution',
  'leadership_operating_model',
] as const

export async function runOriginalPost(): Promise<void> {
  if (!context.subredditName) return
  const state = await getSocialOsState()
  if (!state.enabled || state.mode === 'OBSERVE') return
  const week = Math.floor(Date.now() / (7 * 86400000))
  const topic = TOPICS[week % TOPICS.length]
  if (!topic) return
  const subreddit = context.subredditName
  const idem = `social-os:original:${new Date().toISOString().slice(0, 10)}`
  if (await redis.get(idem)) return

  const rawProfile = await redis.get(
    `social-os:community:${subreddit.toLowerCase()}`,
  )
  if (!rawProfile) return
  try {
    const profile = JSON.parse(rawProfile) as {
      observations: number
      acceptedActions: number
      modWarning?: boolean
      banned?: boolean
    }
    if (!canParticipate(profile)) return
  } catch {
    return
  }

  const generated = await generateOriginalPost({
    subreddit,
    topic,
    brief:
      'Create an evergreen contribution connecting technology, implementation, people, economics and practical outcomes. Avoid news unless independently researched.',
  })
  if (
    generated.action !== 'POST' ||
    !generated.title?.trim() ||
    !generated.body?.trim()
  )
    return

  const plan = mediaPlan(generated)
  const uploaded =
    state.mode === 'CANARY' || state.mode === 'LIVE'
      ? await generateAndUploadImage(plan)
      : null
  const result = await executeAppAction(
    {
      idempotencyKey: idem,
      action: 'POST',
      subreddit,
      title: generated.title,
      body: generated.body,
      mediaUrl: uploaded?.mediaUrl,
      mediaAlt: uploaded?.alt,
      identity: 'APP',
      topic,
      generatedAt: new Date().toISOString(),
    },
    {
      moderationRisk: false,
      researchRequired: false,
      researchVerified: true,
    },
  )
  if (result.executed && result.redditId) {
    await putConversation({
      threadId: result.redditId,
      subreddit,
      state: 'ACTIVE',
      participants: [],
      lastEventAt: new Date().toISOString(),
      ourLastActionId: result.redditId,
      replyCount: 0,
    })
  }
}
