import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
  canParticipate,
  communityStage,
  conversationState,
  detectsOpportunity,
  duplicate,
  gateGenerated,
  isCurrentClaim,
  isPolitical,
  opportunityStage,
  relationshipStage,
  shouldPause,
  shouldReply,
  topic,
} from './core.ts'

test('policy parity', () => {
  assert.equal(isCurrentClaim('Company X acquired Company Y today'), true)
  assert.equal(gateGenerated('DM me and we can help')[0], false)
  assert.equal(gateGenerated('I led the acquisition')[0], false)
  assert.equal(isPolitical('vote for this candidate'), true)
})
test('community parity', () => {
  assert.equal(communityStage({observations: 0, acceptedActions: 0}), 'UNKNOWN')
  assert.equal(
    communityStage({observations: 6, acceptedActions: 0}),
    'UNDERSTOOD',
  )
  assert.equal(canParticipate({observations: 1, acceptedActions: 0}), false)
})
test('semantic parity', () =>
  assert.equal(
    duplicate(
      'integration risk destroys acquisition value',
      ['acquisition value can be destroyed by integration risk'],
      0.6,
    ),
    true,
  ))
test('conversation relationship moderation parity', () => {
  assert.equal(conversationState('thanks'), 'NATURALLY_CLOSED')
  assert.equal(shouldReply('NATURALLY_CLOSED'), false)
  assert.equal(relationshipStage(12, 4, 3), 'STRONG')
  assert.equal(shouldPause(['MOD_WARNING']), true)
})
test('opportunity and topic parity', () => {
  assert.equal(detectsOpportunity('looking for a technology adviser'), true)
  assert.equal(opportunityStage(2), 'QUALIFIED')
  assert.equal(topic('AI agent architecture'), 'technology_ai')
})
