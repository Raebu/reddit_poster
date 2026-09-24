import {openAiRequest} from './openai.ts'

export type Evidence = {
  source: string
  url: string
  publishedAt?: string
  claim: string
  authoritative: boolean
  supportsClaim?: boolean
}
export type ResearchResult = {
  verified: boolean
  evidence: Evidence[]
  reason: string
}

const excluded = /(^|\.)(reddit\.com|wikipedia\.org|quora\.com)$/i
const authoritative =
  /(^|\.)(gov\.uk|europa\.eu|who\.int|oecd\.org|imf\.org|worldbank\.org)$/i

function independenceDomain(url: string): string {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  const parts = host.split('.')
  if (parts.length <= 2) return host
  const suffix2 = parts.slice(-2).join('.')
  if (['co.uk', 'org.uk', 'ac.uk'].includes(suffix2))
    return parts.slice(-3).join('.')
  return suffix2
}

export function verifyEvidence(evidence: Evidence[]): ResearchResult {
  const usable = evidence.filter(item => {
    if (
      !item.source.trim() ||
      !item.claim.trim() ||
      item.supportsClaim !== true
    )
      return false
    try {
      const url = new URL(item.url)
      return /^https?:$/.test(url.protocol) && !excluded.test(url.hostname)
    } catch {
      return false
    }
  })
  const domains = new Set(usable.map(item => independenceDomain(item.url)))
  const verified = usable.some(item => item.authoritative) || domains.size >= 2
  return {
    verified,
    evidence: usable,
    reason: verified
      ? 'claim support and source-independence threshold met'
      : 'insufficient independent evidence that directly supports the claim',
  }
}

async function assessClaimSupport(
  claim: string,
  evidence: Evidence[],
): Promise<Evidence[]> {
  if (!evidence.length) return []
  const response = await openAiRequest('/v1/responses', {
    model: 'gpt-5-mini',
    store: false,
    max_output_tokens: 800,
    text: {
      format: {
        type: 'json_schema',
        name: 'claim_support',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            support: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  index: {type: 'integer'},
                  supports: {type: 'boolean'},
                },
                required: ['index', 'supports'],
                additionalProperties: false,
              },
            },
          },
          required: ['support'],
          additionalProperties: false,
        },
      },
    },
    instructions: [
      'Act as a strict factual entailment gate.',
      'For each evidence item, mark supports=true only when its supplied evidence text directly substantiates the exact material claim.',
      'Topical relevance, implication, corroboration of a different claim, or merely containing similar words is not enough.',
      'When uncertain, mark supports=false.',
    ].join('\n'),
    input: JSON.stringify({
      claim: claim.slice(0, 4_000),
      evidence: evidence.map((item, index) => ({
        index,
        source: item.source,
        url: item.url,
        evidenceText: item.claim.slice(0, 1_500),
      })),
    }),
  })
  if (!response?.ok)
    return evidence.map(item => ({...item, supportsClaim: false}))
  const json = (await response.json()) as {
    output?: Array<{content?: Array<{type?: string; text?: string}>}>
  }
  const outputText = (json.output ?? [])
    .flatMap(item => item.content ?? [])
    .map(part => part.text ?? '')
    .find(Boolean)
  if (!outputText)
    return evidence.map(item => ({...item, supportsClaim: false}))
  try {
    const parsed = JSON.parse(outputText) as {
      support?: Array<{index?: number; supports?: boolean}>
    }
    const support = new Map(
      (parsed.support ?? [])
        .filter(
          item =>
            Number.isInteger(item.index) && typeof item.supports === 'boolean',
        )
        .map(item => [item.index as number, item.supports as boolean]),
    )
    return evidence.map((item, index) => ({
      ...item,
      supportsClaim: support.get(index) === true,
    }))
  } catch {
    return evidence.map(item => ({...item, supportsClaim: false}))
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
        claim: item.synthesis,
        authoritative:
          authoritative.test(host) ||
          /(^|\.)gov($|\.)|(^|\.)edu($|\.)/i.test(host),
        supportsClaim: false,
      })
    } catch {
      // Invalid model-provided URLs are discarded.
    }
    if (evidence.length >= 6) break
  }

  const supported = await assessClaimSupport(claim, evidence)
  return verifyEvidence(supported)
}
