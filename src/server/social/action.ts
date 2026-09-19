export type ExecutableAction = 'COMMENT' | 'POST'
export type ActionEnvelope = {
  idempotencyKey: string
  action: ExecutableAction
  targetId?: string
  subreddit: string
  body: string
  title?: string
  identity: 'APP' | 'USER'
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
