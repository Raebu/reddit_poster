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
