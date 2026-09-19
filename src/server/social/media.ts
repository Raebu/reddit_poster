import {media, settings} from '@devvit/web/server'

export type MediaPlan = {
  needed: boolean
  prompt?: string
  alt?: string
}

export type GeneratedMedia = {
  mediaId: string
  mediaUrl: string
  alt: string
}

export function mediaPlan(input: {
  action: 'COMMENT' | 'POST' | 'NO_ACTION'
  imagePrompt?: string
  body?: string
}): MediaPlan {
  if (input.action !== 'POST' || !input.imagePrompt?.trim())
    return {needed: false}
  return {
    needed: true,
    prompt: input.imagePrompt.trim(),
    alt: input.body?.slice(0, 180) || 'Generated illustration for Reddit post',
  }
}

export async function generateAndUploadImage(
  plan: MediaPlan,
): Promise<GeneratedMedia | null> {
  if (!plan.needed || !plan.prompt) return null
  const key = await settings.get<string>('openai-api-key')
  if (!key) return null

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1-mini',
      prompt: plan.prompt,
      size: '1536x1024',
      quality: 'medium',
      output_format: 'webp',
      n: 1,
    }),
  })
  if (!response.ok)
    throw new Error(`OpenAI image generation failed: ${response.status}`)

  const result = (await response.json()) as {
    data?: Array<{b64_json?: string; url?: string}>
  }
  const image = result.data?.[0]
  const url = image?.b64_json
    ? `data:image/webp;base64,${image.b64_json}`
    : image?.url
  if (!url) throw new Error('OpenAI image generation returned no image')

  const uploaded = await media.upload({url, type: 'image'})
  return {
    mediaId: uploaded.mediaId,
    mediaUrl: uploaded.mediaUrl,
    alt: plan.alt ?? 'Generated illustration for Reddit post',
  }
}
