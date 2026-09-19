import {redis} from '@devvit/web/server'
import {executeAppAction} from './executor.ts'
import {generateOriginalPost} from './llm.ts'
import {generateAndUploadImage, mediaPlan} from './media.ts'

const TARGETS = [
  ['technology', 'technology_ai'],
  ['startups', 'entrepreneurship'],
  ['business', 'strategy_economics'],
  ['consulting', 'transformation_execution'],
  ['softwarearchitecture', 'technology_ai'],
] as const

export async function runOriginalPost(): Promise<void> {
  const week = Math.floor(Date.now() / (7 * 86400000))
  const target = TARGETS[week % TARGETS.length]
  if (!target) return
  const [subreddit, topic] = target
  const idem = `social-os:original:${new Date().toISOString().slice(0, 10)}`
  if (await redis.get(idem)) return

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
  const uploaded = await generateAndUploadImage(plan)
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
      generatedAt: new Date().toISOString(),
    },
    {
      fatigue: 0,
      moderationRisk: false,
      researchRequired: false,
      researchVerified: true,
    },
  )
  if (result.executed) await redis.set(idem, result.redditId ?? '1')
}
