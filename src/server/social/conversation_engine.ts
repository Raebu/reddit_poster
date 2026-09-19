export type ConversationState =
  | 'ACTIVE'
  | 'REPLIED'
  | 'NATURALLY_CLOSED'
  | 'MODERATED'
  | 'LOCKED'
  | 'DELETED'

const closed = /^(thanks|thank you|cheers|helpful|got it|makes sense)[.! ]*$/i

export function conversationState(input: {
  body: string
  locked?: boolean
  deleted?: boolean
  moderated?: boolean
}): ConversationState {
  if (input.deleted) return 'DELETED'
  if (input.locked) return 'LOCKED'
  if (input.moderated) return 'MODERATED'
  if (closed.test(input.body.trim())) return 'NATURALLY_CLOSED'
  return 'ACTIVE'
}

export function shouldContinue(state: ConversationState): boolean {
  return state === 'ACTIVE'
}

export function conversationWithinLimits(
  input: {replyCount?: number; lastReplyAt?: string},
  now = Date.now(),
): boolean {
  if ((input.replyCount ?? 0) >= 3) return false
  if (!input.lastReplyAt) return true
  const last = Date.parse(input.lastReplyAt)
  return !Number.isFinite(last) || now - last >= 30 * 60 * 1000
}
