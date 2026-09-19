export type MediaPlan = {
  needed: boolean
  prompt?: string
  alt?: string
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
