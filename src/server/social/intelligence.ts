export type CommunityProfile = {
  observations: number
  acceptedActions: number
  modWarning?: boolean
  banned?: boolean
}
export type CandidateContext = {
  author: string
  subreddit: string
  postId: string
  text: string
  score?: number
  comments?: number
}
export type Intelligence = {
  saturation: number
  conversationPotential: number
  fatigue: number
  novelty: number
}

export function understandCandidate(
  candidate: CandidateContext,
  recent: {author: number; thread: number; subreddit: number; topic: number},
): Intelligence {
  const comments = Math.max(0, candidate.comments ?? 0)
  const saturation = Math.min(1, Math.log10(comments + 1) / 3)
  const question = /\?/.test(candidate.text) ? 0.25 : 0
  const depth = Math.min(0.5, candidate.text.length / 1200)
  const conversationPotential = Math.min(1, 0.25 + question + depth - saturation * 0.25)
  const fatigue = Math.min(
    1,
    Math.max(recent.author / 2, recent.thread, recent.subreddit / 4, recent.topic / 4),
  )
  const novelty = Math.max(0, 1 - fatigue)
  return {saturation, conversationPotential, fatigue, novelty}
}

export function shouldPauseCommunity(profile: CommunityProfile): boolean {
  return Boolean(profile.banned || profile.modWarning)
}
