import assert from 'node:assert/strict'
import {test} from 'node:test'
import {type Evidence, verifyEvidence} from './research.ts'

const evidence = (
  url: string,
  supportsClaim: boolean,
  authoritative = false,
): Evidence => ({
  source: url,
  url,
  claim: 'Evidence text',
  authoritative,
  supportsClaim,
})

test('two unrelated sources do not verify a claim', () => {
  const result = verifyEvidence([
    evidence('https://example.com/a', false),
    evidence('https://another.org/b', false),
  ])
  assert.equal(result.verified, false)
  assert.equal(result.evidence.length, 0)
})

test('two independent supporting sources verify a claim', () => {
  const result = verifyEvidence([
    evidence('https://example.com/a', true),
    evidence('https://another.org/b', true),
  ])
  assert.equal(result.verified, true)
})

test('subdomains of one organisation are not independent sources', () => {
  const result = verifyEvidence([
    evidence('https://news.example.com/a', true),
    evidence('https://research.example.com/b', true),
  ])
  assert.equal(result.verified, false)
})

test('one authoritative source must still directly support the claim', () => {
  assert.equal(
    verifyEvidence([evidence('https://gov.uk/a', false, true)]).verified,
    false,
  )
  assert.equal(
    verifyEvidence([evidence('https://gov.uk/a', true, true)]).verified,
    true,
  )
})
