import {redis} from '@devvit/web/server'

export type RelationshipMemory = {
  author: string
  interactions: number
  substantiveReplies: number
  reciprocalReplies: number
  lastInteractionAt?: string
}

export type ConversationMemory = {
  threadId: string
  subreddit: string
  state: string
  participants: string[]
  lastEventAt: string
  ourLastActionId?: string
}

export async function relationship(author: string): Promise<RelationshipMemory> {
  const key = `social-os:relationship:${author.toLowerCase()}`
  const raw = await redis.get(key)
  return raw
    ? (JSON.parse(raw) as RelationshipMemory)
    : {author, interactions: 0, substantiveReplies: 0, reciprocalReplies: 0}
}

export async function recordRelationship(
  author: string,
  delta: Partial<Pick<RelationshipMemory, 'interactions' | 'substantiveReplies' | 'reciprocalReplies'>>,
): Promise<RelationshipMemory> {
  const current = await relationship(author)
  const next = {
    ...current,
    interactions: current.interactions + (delta.interactions ?? 0),
    substantiveReplies: current.substantiveReplies + (delta.substantiveReplies ?? 0),
    reciprocalReplies: current.reciprocalReplies + (delta.reciprocalReplies ?? 0),
    lastInteractionAt: new Date().toISOString(),
  }
  await redis.set(
    `social-os:relationship:${author.toLowerCase()}`,
    JSON.stringify(next),
  )
  return next
}

export async function putConversation(memory: ConversationMemory): Promise<void> {
  await redis.set(`social-os:conversation:${memory.threadId}`, JSON.stringify(memory))
}

export async function getConversation(
  threadId: string,
): Promise<ConversationMemory | null> {
  const raw = await redis.get(`social-os:conversation:${threadId}`)
  return raw ? (JSON.parse(raw) as ConversationMemory) : null
}

export async function purgeContent(id: string): Promise<void> {
  await redis.del(`social-os:decision:${id}`)
  await redis.del(`social-os:shadow:${id}`)
  await redis.del(`social-os:conversation:${id}`)
}
