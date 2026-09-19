import {randomUUID} from 'node:crypto'
import {context, reddit, redis} from '@devvit/web/server'
import {getSocialOsState, setSocialOsState} from './db.ts'
import {
  type CommunityProfile,
  communityStage,
  isCurrentClaim,
  isPolitical,
  topic,
} from './social/core.ts'
import {executeAppAction} from './social/executor.ts'
import {generateContent} from './social/llm.ts'
import {putConversation, recordRelationship} from './social/memory.ts'
import {researchClaim} from './social/research.ts'
import {shadowDecision} from './social/shadow.ts'

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

export async function runObserver() {
  const initial = await getSocialOsState()
  if (!initial.enabled || !context.subredditName) return initial

  const lockKey = 'social-os:observer-lock'
  const lockToken = randomUUID()
  await redis.set(lockKey, lockToken, {
    nx: true,
    expiration: new Date(Date.now() + 4 * 60_000),
  })
  if ((await redis.get(lockKey)) !== lockToken) return initial

  let decisions = 0
  let holds = 0
  let noActions = 0
  let shadowProposals = 0
  let shadowComments = 0
  let failures = 0

  try {
    const subredditName = context.subredditName
    try {
      const profileKey = `social-os:community:${subredditName.toLowerCase()}`
      const profile = parseProfile(await redis.get(profileKey))
      profile.observations += 1
      await redis.set(
        profileKey,
        JSON.stringify({...profile, stage: communityStage(profile)}),
      )

      const posts = await reddit
        .getNewPosts({subredditName, limit: 25, pageSize: 25})
        .all()
      for (const post of posts) {
        const seenKey = `social-os:seen:${post.id}`
        if (await redis.get(seenKey)) continue
        const text = `${post.title}\n${post.body ?? ''}`.trim()
        if (text.length < 80) {
          await redis.set(seenKey, 'short', {
            expiration: new Date(Date.now() + THIRTY_DAYS),
          })
          continue
        }
        decisions += 1

        let decision = 'NO_ACTION'
        let reason = 'observe mode'
        let score = 0
        let draft: string | undefined
        let executed = false
        let redditId: string | undefined
        const researchRequired = isCurrentClaim(text)
        let research = {
          verified: !researchRequired,
          evidence: [] as Awaited<ReturnType<typeof researchClaim>>['evidence'],
          reason: researchRequired
            ? 'research not run in observe mode'
            : 'research not required',
        }

        if (
          initial.mode === 'SHADOW' ||
          initial.mode === 'CANARY' ||
          initial.mode === 'LIVE'
        ) {
          if (researchRequired) research = await researchClaim(text)
          const shadow = shadowDecision({
            text,
            subreddit: subredditName,
            community: profile,
            score: post.score,
            comments: post.numberOfComments,
            researchVerified: research.verified,
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
              evidence: research.evidence,
            })
            if (generated.action === 'COMMENT' && generated.body) {
              const result = await executeAppAction(
                {
                  idempotencyKey: `comment:${post.id}`,
                  action: 'COMMENT',
                  targetId: post.id,
                  subreddit: subredditName,
                  body: generated.body,
                  identity: 'APP',
                  author: post.authorName,
                  topic: shadow.topic,
                  generatedAt: new Date().toISOString(),
                },
                {
                  moderationRisk: Boolean(profile.banned || profile.modWarning),
                  researchRequired,
                  researchVerified: research.verified,
                },
              )
              executed = result.executed
              redditId = result.redditId
              reason = result.reason
              if (executed) {
                profile.acceptedActions += 1
                await recordRelationship(post.authorName, {interactions: 1})
                await putConversation({
                  threadId: post.id,
                  subreddit: subredditName,
                  state: 'ACTIVE',
                  participants: [post.authorName],
                  lastEventAt: new Date().toISOString(),
                  ourLastActionId: redditId,
                  replyCount: 0,
                })
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
        } else if (researchRequired) {
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
          mode: initial.mode,
          decision,
          reason,
          researchReason: research.reason,
          evidenceCount: research.evidence.length,
          score,
          draft,
          executed,
          redditId,
        }
        await redis.set(
          `social-os:decision:${post.id}`,
          JSON.stringify(record),
          {expiration: new Date(Date.now() + THIRTY_DAYS)},
        )
        if (initial.mode !== 'OBSERVE' && decision !== 'NO_ACTION') {
          await redis.set(
            `social-os:shadow:${post.id}`,
            JSON.stringify(record),
            {expiration: new Date(Date.now() + THIRTY_DAYS)},
          )
        }
        await redis.set(seenKey, '1', {
          expiration: new Date(Date.now() + THIRTY_DAYS),
        })
      }
      await redis.set(
        profileKey,
        JSON.stringify({...profile, stage: communityStage(profile)}),
      )
    } catch (error) {
      failures += 1
      console.error(
        'observer subreddit failure',
        context.subredditName,
        error instanceof Error ? error.message : String(error),
      )
    }

    const current = await getSocialOsState()
    const next = {
      ...current,
      decisions: current.decisions + decisions,
      holds: current.holds + holds,
      noActions: current.noActions + noActions,
      shadowProposals: current.shadowProposals + shadowProposals,
      shadowComments: current.shadowComments + shadowComments,
      failures: failures === 0 ? 0 : current.failures + failures,
      lastRunAt: new Date().toISOString(),
    }
    await setSocialOsState(next)
    return next
  } finally {
    if ((await redis.get(lockKey)) === lockToken) await redis.del(lockKey)
  }
}

function parseProfile(raw: string | undefined): CommunityProfile {
  if (!raw) return {observations: 0, acceptedActions: 0}
  try {
    const value = JSON.parse(raw) as Partial<CommunityProfile>
    return {
      observations: Math.max(0, Number(value.observations) || 0),
      acceptedActions: Math.max(0, Number(value.acceptedActions) || 0),
      modWarning: Boolean(value.modWarning),
      banned: Boolean(value.banned),
    }
  } catch {
    return {observations: 0, acceptedActions: 0}
  }
}
