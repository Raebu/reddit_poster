import assert from 'node:assert/strict'
import {test} from 'node:test'
import {shadowDecision} from './shadow.ts'

const understood = {observations: 6, acceptedActions: 0}

test('shadow never proposes political engagement', () => {
  const d = shadowDecision({
    text: 'Should people vote for this candidate in the election? '.repeat(4),
    subreddit: 'business',
    community: understood,
  })
  assert.equal(d.action, 'NO_ACTION')
  assert.equal(d.reason, 'political restraint')
})

test('shadow holds current claims for research', () => {
  const d = shadowDecision({
    text: 'Company X announced a merger today and the integration economics raise a serious implementation question. '.repeat(
      3,
    ),
    subreddit: 'business',
    community: understood,
  })
  assert.equal(d.action, 'HOLD')
})

test('shadow refuses unknown communities', () => {
  const d = shadowDecision({
    text: 'How should a startup think about implementation economics and distribution trade-offs? '.repeat(
      4,
    ),
    subreddit: 'startups',
    community: {observations: 1, acceptedActions: 0},
  })
  assert.equal(d.action, 'NO_ACTION')
  assert.equal(d.reason, 'community not yet understood')
})

test('shadow proposes a comment only for high-value candidates', () => {
  const d = shadowDecision({
    text: 'How should an AI startup think about software architecture, implementation trade-offs, adoption economics and execution risk when moving an agent from prototype to production? '.repeat(
      3,
    ),
    subreddit: 'startups',
    community: understood,
    score: 12,
    comments: 24,
  })
  assert.equal(d.action, 'COMMENT')
  assert.ok(d.draft)
  assert.ok(d.score >= 6)
})

test('shadow remains selective', () => {
  const d = shadowDecision({
    text: 'Here is a product update with some details but no particular question or implementation issue. '.repeat(
      3,
    ),
    subreddit: 'startups',
    community: understood,
  })
  assert.notEqual(d.action, 'COMMENT')
})

test('shadow never proposes unsupported vote or follow actions', () => {
  const d = shadowDecision({
    text: 'A thoughtful AI software implementation discussion with architecture, economics and execution constraints that is useful but does not ask a question. '.repeat(
      2,
    ),
    subreddit: 'technology',
    community: understood,
  })
  assert.ok(['COMMENT', 'POST', 'NO_ACTION', 'HOLD'].includes(d.action))
})
