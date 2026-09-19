import {settings} from '@devvit/web/server'
import {voiceBrief} from './voice.ts'

type GenerateInput = {
  text: string
  subreddit: string
  topic: string
  evidence?: Array<{source: string; url: string; claim: string}>
}

type GeneratedContent = {
  action: 'COMMENT' | 'POST' | 'NO_ACTION'
  body?: string
  title?: string
  imagePrompt?: string
  rationale: string
}

const OPENAI_URL = 'https://api.openai.com/v1/responses'
const OPENAI_MODEL = 'gpt-5-mini'

async function apiKey(): Promise<string | null> {
  return (await settings.get<string>('openai-api-key')) || null
}

export async function generateContent(
  input: GenerateInput,
): Promise<GeneratedContent> {
  const key = await apiKey()
  if (!key)
    return {
      action: 'NO_ACTION',
      rationale: 'OpenAI secret unavailable; fail closed',
    }

  const evidence = (input.evidence ?? [])
    .map(item => `${item.source}: ${item.claim} (${item.url})`)
    .join('\n')

  const prompt = [
    voiceBrief(input.topic),
    'Return strict JSON with action, body, optional title, optional imagePrompt and rationale.',
    'Only COMMENT, POST or NO_ACTION are permitted.',
    'Never invent personal experience or unsupported facts.',
    `Subreddit: ${input.subreddit}`,
    `Source discussion:\n${input.text}`,
    evidence
      ? `Verified evidence:\n${evidence}`
      : 'No external evidence supplied.',
  ].join('\n\n')

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      store: false,
      input: prompt,
      text: {format: {type: 'json_object'}},
    }),
  })

  if (!response.ok)
    return {action: 'NO_ACTION', rationale: `OpenAI failed: ${response.status}`}

  const json = (await response.json()) as {
    output_text?: string
    output?: Array<{content?: Array<{text?: string}>}>
  }
  const raw =
    json.output_text ??
    json.output
      ?.flatMap(item => item.content ?? [])
      .map(item => item.text ?? '')
      .join('') ??
    ''
  try {
    const parsed = JSON.parse(raw) as GeneratedContent
    if (!['COMMENT', 'POST', 'NO_ACTION'].includes(parsed.action))
      return {action: 'NO_ACTION', rationale: 'invalid model action'}
    return parsed
  } catch {
    return {action: 'NO_ACTION', rationale: 'invalid model JSON'}
  }
}


export async function generateOriginalPost(input: {
  subreddit: string
  topic: string
  brief: string
}): Promise<GeneratedContent> {
  const key = await apiKey()
  if (!key)
    return {action: 'NO_ACTION', rationale: 'OpenAI secret unavailable; fail closed'}

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      store: false,
      input: [
        voiceBrief(input.topic),
        'Write one genuinely useful, Reddit-native original post or choose NO_ACTION.',
        'Prefer a specific mechanism, trade-off, implementation lesson or thoughtful question.',
        'Do not invent personal experience, clients, meetings, results or current facts.',
        'If there is no worthwhile original contribution, choose NO_ACTION.',
        'Return strict JSON with action POST or NO_ACTION, title, body, imagePrompt and rationale.',
        `Subreddit: ${input.subreddit}`,
        `Brief: ${input.brief}`,
      ].join('\n\n'),
      text: {format: {type: 'json_object'}},
    }),
  })
  if (!response.ok)
    return {action: 'NO_ACTION', rationale: `OpenAI failed: ${response.status}`}

  const json = (await response.json()) as {
    output_text?: string
    output?: Array<{content?: Array<{text?: string}>}>
  }
  const raw =
    json.output_text ??
    json.output
      ?.flatMap(item => item.content ?? [])
      .map(item => item.text ?? '')
      .join('') ??
    ''
  try {
    const parsed = JSON.parse(raw) as GeneratedContent
    return parsed.action === 'POST'
      ? parsed
      : {action: 'NO_ACTION', rationale: parsed.rationale || 'no worthwhile post'}
  } catch {
    return {action: 'NO_ACTION', rationale: 'invalid model JSON'}
  }
}
