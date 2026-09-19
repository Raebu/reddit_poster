import {reddit, redis} from '@devvit/web/server'
import {getSocialOsState, setSocialOsState} from './db.ts'
import {
  communityStage,
  isCurrentClaim,
  isPolitical,
  topic,
} from './social/core.ts'
import {executeAppAction} from './social/executor.ts'
import {generateContent} from './social/llm.ts'
import {mediaPlan} from './social/media.ts'
import {recordRelationship} from './social/memory.ts'
import {shadowDecision} from './social/shadow.ts'

const SUBREDDITS = [
  'technology',
  'artificial',
  'MachineLearning',
  'startups',
  'Entrepreneur',
  'private_equity',
  'venturecapital',
  'finance',
  'business',
  'consulting',
  'softwarearchitecture',
]

export async function runObserver() {
  const state = await getSocialOsState()
  if (!state.enabled) return state
  let decisions = 0
  let holds = 0
  let noActions = 0
  let shadowProposals = 0
  let shadowComments = 0
  let failures = 0

  for (const subredditName of SUBREDDITS) {
    try {
      const profileKey = `social-os:community:${subredditName.toLowerCase()}`
      const raw = await redis.get(profileKey)
      const profile = raw
        ? JSON.parse(raw)
        : {observations: 0, acceptedActions: 0}
      profile.observations += 1
      await redis.set(
        profileKey,
        JSON.stringify({...profile, stage: communityStage(profile)}),
      )

      const posts = await reddit
        .getNewPosts({subredditName, limit: 10, pageSize: 10})
        .all()
      for (const post of posts) {
        const seenKey = `social-os:seen:${post.id}`
        if (await redis.get(seenKey)) continue
        await redis.set(seenKey, '1', {
          expiration: new Date(Date.now() + 30 * 86400000),
        })
        const text = `${post.title}\n${post.body ?? ''}`.trim()
        if (text.length < 80) continue
        decisions += 1

        let decision = 'NO_ACTION'
        let reason = 'observe mode'
        let score = 0
        let draft: string | undefined
        let executed = false
        let redditId: string | undefined

        if (
          state.mode === 'SHADOW' ||
          state.mode === 'CANARY' ||
          state.mode === 'LIVE'
        ) {
          const shadow = shadowDecision({
            text,
            subreddit: subredditName,
            community: profile,
          })
          decision = shadow.action
          reason = shadow.reason
          score = shadow.score
          draft = shadow.draft

          if (decision === 'COMMENT') {
            const generated = await generateContent({
              text,
              subreddit: subredditName,
              topic: shadow.topic,
            })
            if (generated.action === 'COMMENT' && generated.body) {
              const media = mediaPlan(generated)
              if (media.needed) {
                reason = 'media planned but comment media unsupported'
              }
              const result = await executeAppAction(
                {
                  idempotencyKey: `comment:${post.id}`,
                  action: 'COMMENT',
                  targetId: post.id,
                  subreddit: subredditName,
                  body: generated.body,
                  identity: 'APP',
                  generatedAt: new Date().toISOString(),
                },
                {
                  fatigue: 0,
                  moderationRisk: Boolean(profile.banned || profile.modWarning),
                  researchRequired: isCurrentClaim(text),
                  researchVerified: !isCurrentClaim(text),
                },
              )
              executed = result.executed
              redditId = result.redditId
              reason = result.reason
              if (executed) {
                profile.acceptedActions += 1
                await recordRelationship(post.authorName, {interactions: 1})
              }
            } else {
              decision = generated.action
              reason = generated.rationale
            }
          }

          if (decision === 'HOLD') holds += 1
          else if (decision === 'NO_ACTION') noActions += 1
          else {
            shadowProposals += 1
            if (decision === 'COMMENT') shadowComments += 1
          }
        } else if (isPolitical(text)) {
          reason = 'political restraint'
          noActions += 1
        } else if (isCurrentClaim(text)) {
          decision = 'HOLD'
          reason = 'current claim requires verified research'
          holds += 1
        } else noActions += 1

        const record = {
          at: new Date().toISOString(),
          id: post.id,
          subreddit: subredditName,
          author: post.authorName,
          topic: topic(text, subredditName),
          mode: state.mode,
          decision,
          reason,
          score,
          draft,
          executed,
          redditId,
        }
        await redis.set(
          `social-os:decision:${post.id}`,
          JSON.stringify(record),
          {expiration: new Date(Date.now() + 30 * 86400000)},
        )
        if (state.mode !== 'OBSERVE' && decision !== 'NO_ACTION') {
          await redis.set(
            `social-os:shadow:${post.id}`,
            JSON.stringify(record),
            {expiration: new Date(Date.now() + 30 * 86400000)},
          )
        }
      }
      await redis.set(
        profileKey,
        JSON.stringify({...profile, stage: communityStage(profile)}),
      )
    } catch (error) {
      failures += 1
      console.error('observer subreddit failure', subredditName, error)
    }
  }

  const current = await getSocialOsState()
  const next = {
    ...current,
    decisions: current.decisions + decisions,
    holds: current.holds + holds,
    noActions: current.noActions + noActions,
    shadowProposals: current.shadowProposals + shadowProposals,
    shadowComments: current.shadowComments + shadowComments,
    failures: current.failures + failures,
    lastRunAt: new Date().toISOString(),
  }
  await setSocialOsState(next)
  return next
}
