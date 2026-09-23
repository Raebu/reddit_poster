export type GovernanceInput = {
  enabled: boolean
  mode: 'OBSERVE' | 'SHADOW' | 'CANARY' | 'LIVE'
  failures: number
  paused: boolean
  duplicate: boolean
  fatigue: number
  moderationRisk: boolean
  researchRequired: boolean
  researchVerified: boolean
  actionsToday: number
  actionsThisHour: number
}

export type GovernanceResult = {allow: boolean; reason: string}

export function governanceGate(input: GovernanceInput): GovernanceResult {
  if (!input.enabled) return {allow: false, reason: 'global kill switch'}
  if (input.paused || input.moderationRisk)
    return {allow: false, reason: 'moderation pause'}
  if (input.failures >= 3)
    return {allow: false, reason: 'failure circuit breaker'}
  if (input.duplicate) return {allow: false, reason: 'duplicate protection'}
  if (input.fatigue >= 1) return {allow: false, reason: 'fatigue hold'}
  if (input.researchRequired && !input.researchVerified)
    return {allow: false, reason: 'research not verified'}
  if (input.mode === 'OBSERVE' || input.mode === 'SHADOW')
    return {allow: false, reason: 'non-executing mode'}
  if (
    input.mode === 'CANARY' &&
    (input.actionsToday >= 1 || input.actionsThisHour >= 1)
  )
    return {allow: false, reason: 'canary action budget'}
  if (input.actionsThisHour >= 2 || input.actionsToday >= 6)
    return {allow: false, reason: 'live action budget'}
  return {allow: true, reason: 'eligible'}
}
