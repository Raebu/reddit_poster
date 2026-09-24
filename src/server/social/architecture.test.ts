import assert from 'node:assert/strict'
import {test} from 'node:test'
import {routeAction} from './action.ts'
import {
  conversationState,
  conversationWithinLimits,
  shouldContinue,
} from './conversation_engine.ts'
import {governanceGate} from './governance.ts'
import {understandCandidate} from './intelligence.ts'
import {mediaPlan} from './media.ts'
import {verifyEvidence} from './research.ts'
import {voiceBrief} from './voice.ts'

test('governance fails closed in shadow', () => {
  const g = governanceGate({
    enabled: true,
    mode: 'SHADOW',
    failures: 0,
    paused: false,
    duplicate: false,
    fatigue: 0,
    moderationRisk: false,
    researchRequired: false,
    researchVerified: false,
    actionsToday: 0,
    actionsThisHour: 0,
  })
  assert.equal(g.allow, false)
})

test('canary is tightly budgeted', () => {
  const g = governanceGate({
    enabled: true,
    mode: 'CANARY',
    failures: 0,
    paused: false,
    duplicate: false,
    fatigue: 0,
    moderationRisk: false,
    researchRequired: false,
    researchVerified: false,
    actionsToday: 1,
    actionsThisHour: 0,
  })
  assert.equal(g.allow, false)
  assert.equal(g.reason, 'canary action budget')
})

test('research requires authoritative or independent evidence', () => {
  assert.equal(
    verifyEvidence([
      {
        source: 'primary',
        url: 'https://example.test',
        claim: 'x',
        authoritative: true,
        supportsClaim: true,
      },
    ]).verified,
    true,
  )
  assert.equal(
    verifyEvidence([
      {
        source: 'one',
        url: 'https://example.test',
        claim: 'x',
        authoritative: false,
        supportsClaim: true,
      },
    ]).verified,
    false,
  )
  assert.equal(
    verifyEvidence([
      {
        source: 'one',
        url: 'https://news.example/a',
        claim: 'x',
        authoritative: false,
        supportsClaim: true,
      },
      {
        source: 'same publisher',
        url: 'https://news.example/b',
        claim: 'x',
        authoritative: false,
        supportsClaim: true,
      },
    ]).verified,
    false,
  )
})

test('user identity always routes to explicit approval', () => {
  const routed = routeAction({
    idempotencyKey: 'x',
    action: 'COMMENT',
    targetId: 't3_x',
    subreddit: 'technology',
    body: 'Useful contribution',
    identity: 'USER',
    generatedAt: new Date(0).toISOString(),
  })
  assert.equal(routed.kind, 'USER_APPROVAL')
})

test('app identity can route autonomously', () => {
  const routed = routeAction({
    idempotencyKey: 'x',
    action: 'POST',
    subreddit: 'technology',
    title: 'A useful post',
    body: 'Useful contribution',
    identity: 'APP',
    generatedAt: new Date(0).toISOString(),
  })
  assert.equal(routed.kind, 'AUTONOMOUS_APP')
})

test('conversation closes naturally', () => {
  const state = conversationState({body: 'Thanks!'})
  assert.equal(state, 'NATURALLY_CLOSED')
  assert.equal(shouldContinue(state), false)
})

test('conversation limits stop rapid or runaway replies', () => {
  assert.equal(conversationWithinLimits({replyCount: 3}), false)
  assert.equal(
    conversationWithinLimits({
      replyCount: 1,
      lastReplyAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    }),
    false,
  )
})

test('candidate intelligence applies fatigue', () => {
  const result = understandCandidate(
    {
      author: 'a',
      subreddit: 'technology',
      postId: 'p',
      text: 'How should this architecture work?',
      comments: 20,
    },
    {author: 2, thread: 0, subreddit: 0, topic: 0},
  )
  assert.equal(result.fatigue, 1)
  assert.equal(result.novelty, 0)
})

test('voice brief encodes non-invention rule', () => {
  assert.match(voiceBrief('technology_ai'), /Never invent experience or facts/)
})

test('media planner only enables image generation for posts', () => {
  assert.equal(
    mediaPlan({action: 'COMMENT', imagePrompt: 'diagram'}).needed,
    false,
  )
  const plan = mediaPlan({
    action: 'POST',
    imagePrompt: 'A clean systems architecture diagram',
    body: 'Architecture overview. '.repeat(30),
  })
  assert.equal(plan.needed, true)
  assert.match(plan.prompt ?? '', /architecture/)
})
