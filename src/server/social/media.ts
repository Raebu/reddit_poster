import {media} from '@devvit/web/server'
import {openAiRequest} from './openai.ts'

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
  const prompt = input.imagePrompt?.trim()
  if (
    input.action !== 'POST' ||
    !prompt ||
    (input.body?.length ?? 0) < 400 ||
    !/\b(diagram|framework|map|flow|architecture|system|process|matrix|chart|visual)\b/i.test(
      prompt,
    )
  )
    return {needed: false}
  return {
    needed: true,
    prompt,
    alt: input.body?.slice(0, 180) || 'Generated illustration for Reddit post',
  }
}

export async function generateAndUploadImage(
  plan: MediaPlan,
): Promise<GeneratedMedia | null> {
  if (!plan.needed || !plan.prompt) return null
  const response = await openAiRequest(
    '/v1/images/generations',
    {
      model: 'gpt-image-2',
      prompt: plan.prompt,
      size: '1536x1024',
      quality: 'medium',
      output_format: 'webp',
      n: 1,
    },
    {timeoutMs: 120_000, attempts: 2},
  )
  if (!response) return null
  if (!response.ok)
    throw new Error(`OpenAI image generation failed: ${response.status}`)

  const result = (await response.json()) as {
    data?: Array<{b64_json?: string; url?: string}>
  }
  const image = result.data?.[0]
  if (image?.b64_json && image.b64_json.length > 27_000_000)
    throw new Error('OpenAI image exceeds Reddit media size limit')
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
