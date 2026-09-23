export type ExecutableAction = 'COMMENT' | 'POST'
export type ActionEnvelope = {
  idempotencyKey: string
  action: ExecutableAction
  targetId?: string
  subreddit: string
  body: string
  title?: string
  mediaUrl?: string
  mediaAlt?: string
  identity: 'APP' | 'USER'
  author?: string
  topic?: string
  requestedBy?: {id: string; username: string}
  generatedAt: string
}
export type ActionRoute =
  | {kind: 'AUTONOMOUS_APP'; envelope: ActionEnvelope}
  | {kind: 'USER_APPROVAL'; envelope: ActionEnvelope}
  | {kind: 'BLOCKED'; reason: string}

export function routeAction(envelope: ActionEnvelope): ActionRoute {
  if (!envelope.body.trim()) return {kind: 'BLOCKED', reason: 'empty content'}
  if (envelope.identity === 'USER') return {kind: 'USER_APPROVAL', envelope}
  return {kind: 'AUTONOMOUS_APP', envelope}
}
