import {settings} from '@devvit/web/server'

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
    reason: verified
      ? 'evidence threshold met'
      : 'insufficient independent evidence',
  }
}

export async function researchClaim(claim: string): Promise<ResearchResult> {
  const key = await settings.get<string>('openai-api-key')
  if (!key)
    return {verified: false, evidence: [], reason: 'OpenAI secret unavailable'}

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      store: false,
      tools: [{type: 'web_search'}],
      tool_choice: 'auto',
      include: ['web_search_call.action.sources'],
      input: [
        'Research this claim before it can be used in a Reddit response.',
        'Prefer primary, official and authoritative sources.',
        'Do not treat Reddit, social posts, forums or Wikipedia as verification.',
        `Claim: ${claim}`,
      ].join('\n'),
    }),
  })
  if (!response.ok)
    return {
      verified: false,
      evidence: [],
      reason: `research request failed: ${response.status}`,
    }

  const json = (await response.json()) as {
    output?: Array<{
      type?: string
      action?: {
        sources?: Array<{url?: string; title?: string}>
      }
      content?: Array<{
        text?: string
        annotations?: Array<{type?: string; url?: string; title?: string}>
      }>
    }>
  }

  const urls = new Map<string, string>()
  for (const item of json.output ?? []) {
    for (const source of item.action?.sources ?? []) {
      if (source.url) urls.set(source.url, source.title ?? source.url)
    }
    for (const part of item.content ?? []) {
      for (const annotation of part.annotations ?? []) {
        if (annotation.type === 'url_citation' && annotation.url)
          urls.set(annotation.url, annotation.title ?? annotation.url)
      }
    }
  }

  const evidence: Evidence[] = Array.from(urls.entries())
    .filter(([url]) => !/reddit\.com|wikipedia\.org|quora\.com/i.test(url))
    .slice(0, 6)
    .map(([url, source]) => ({
      source,
      url,
      claim,
      authoritative: /\.gov\b|\.gov\.uk\b|\.edu\b|who\.int\b/i.test(url),
    }))

  return verifyEvidence(evidence)
}
