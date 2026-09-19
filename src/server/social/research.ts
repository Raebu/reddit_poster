export type Evidence = {
  source: string
  url: string
  publishedAt?: string
  claim: string
  authoritative: boolean
}
export type ResearchResult = {
  verified: boolean
  evidence: Evidence[]
  reason: string
}

export function verifyEvidence(evidence: Evidence[]): ResearchResult {
  const usable = evidence.filter(item => item.source && item.url && item.claim)
  const authoritative = usable.some(item => item.authoritative)
  const verified = authoritative || usable.length >= 2
  return {
    verified,
    evidence: usable,
    reason: verified ? 'evidence threshold met' : 'insufficient independent evidence',
  }
}
