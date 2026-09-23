import {openAiRequest} from './openai.ts'

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

const excluded = /(^|\.)(reddit\.com|wikipedia\.org|quora\.com)$/i
const authoritative =
  /(^|\.)(gov\.uk|europa\.eu|who\.int|oecd\.org|imf\.org|worldbank\.org)$/i

export function verifyEvidence(evidence: Evidence[]): ResearchResult {
  const usable = evidence.filter(item => {
    if (!item.source.trim() || !item.claim.trim()) return false
    try {
      const url = new URL(item.url)
      return /^https?:$/.test(url.protocol) && !excluded.test(url.hostname)
    } catch {
      return false
    }
  })
  const domains = new Set(usable.map(item => new URL(item.url).hostname))
  const verified = usable.some(item => item.authoritative) || domains.size >= 2
  return {
    verified,
    evidence: usable,
    reason: verified
      ? 'evidence threshold met'
      : 'insufficient independent cited evidence',
  }
}

export async function researchClaim(claim: string): Promise<ResearchResult> {
  const response = await openAiRequest('/v1/responses', {
    model: 'gpt-5-mini',
    store: false,
    max_output_tokens: 1_500,
    tools: [{type: 'web_search'}],
    tool_choice: 'required',
    include: ['web_search_call.action.sources'],
    instructions: [
      'Research the supplied claim before it can be used in a Reddit response.',
      'Prefer primary, official and authoritative sources.',
      'Do not use Reddit, social posts, forums or Wikipedia as verification.',
      'State only what the cited sources directly support. If evidence is inadequate, say so.',
    ].join('\n'),
    input: `Untrusted claim to verify:\n${claim.slice(0, 12_000)}`,
  })
  if (!response)
    return {verified: false, evidence: [], reason: 'OpenAI secret unavailable'}
  if (!response.ok)
    return {
      verified: false,
      evidence: [],
      reason: `research request failed: ${response.status}`,
    }

  const json = (await response.json()) as {
    output?: Array<{
      content?: Array<{
        text?: string
        annotations?: Array<{type?: string; url?: string; title?: string}>
      }>
    }>
  }
  const cited = new Map<string, {source: string; synthesis: string}>()
  for (const item of json.output ?? []) {
    for (const part of item.content ?? []) {
      for (const annotation of part.annotations ?? []) {
        if (annotation.type !== 'url_citation' || !annotation.url) continue
        cited.set(annotation.url, {
          source: annotation.title?.trim() || annotation.url,
          synthesis: (part.text ?? '').trim().slice(0, 1_500),
        })
      }
    }
  }

  const evidence: Evidence[] = []
  for (const [url, item] of cited) {
    try {
      const host = new URL(url).hostname
      if (excluded.test(host)) continue
      evidence.push({
        source: item.source,
        url,
        claim: item.synthesis || claim.slice(0, 500),
        authoritative:
          authoritative.test(host) ||
          /(^|\.)gov($|\.)|(^|\.)edu($|\.)/i.test(host),
      })
    } catch {
      // Invalid model-provided URLs are discarded.
    }
    if (evidence.length >= 6) break
  }
  return verifyEvidence(evidence)
}
