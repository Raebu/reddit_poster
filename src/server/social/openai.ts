import {settings} from '@devvit/web/server'

const OPENAI_ORIGIN = 'https://api.openai.com'
const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504])

export async function openAiKey(): Promise<string | null> {
  const value = await settings.get<string>('openai-api-key')
  return typeof value === 'string' && value.trim() ? value : null
}

export async function openAiRequest(
  path: string,
  body: Readonly<Record<string, unknown>>,
  options: {timeoutMs?: number; attempts?: number} = {},
): Promise<Response | null> {
  const key = await openAiKey()
  if (!key) return null

  const attempts = Math.max(1, options.attempts ?? 3)
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${OPENAI_ORIGIN}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      })
      if (!RETRYABLE.has(response.status) || attempt === attempts - 1)
        return response

      const retryAfter = Number(response.headers.get('retry-after') ?? '0')
      await delay(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 5_000)
          : 250 * 2 ** attempt,
      )
    } catch (error) {
      lastError = error
      if (attempt === attempts - 1) throw error
      await delay(250 * 2 ** attempt)
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('OpenAI request failed')
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
