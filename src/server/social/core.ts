export type CommunityProfile = {
  observations: number
  acceptedActions: number
  removals?: number
  modWarning?: boolean
  banned?: boolean
}
export type Topic =
  | 'technology_ai'
  | 'ma_corpdev'
  | 'strategy_economics'
  | 'investment_capital'
  | 'leadership_operating_model'
  | 'transformation_execution'
  | 'entrepreneurship_building'
  | 'human_curiosity'
const political =
  /\b(election|candidate|vote|voting|party|parliament|president|prime minister|ballot|referendum)\b/i
const current =
  /\b(today|yesterday|breaking|just announced|acquir(?:e|ed|es|ing)|merger|deal value|valued at|raised|funding round|lawsuit|alleg(?:e|ed|ation)|election|candidate|vote|poll)\b/i
const sales = /\b(dm me|book a call|we can help|contact us|hire us|buy now)\b/i
const personal =
  /\b(i|we)\s+(led|advised|acquired|bought|sold|invested|integrated|closed|worked|built|delivered|helped|saw|have seen)|\b(my|our)\s+(client|customer|project|deal|transaction|team|experience)\b/i
const terms: Record<Exclude<Topic, 'human_curiosity'>, RegExp> = {
  technology_ai:
    /\b(ai|automation|software|technology|model|agent|cloud|data|cyber)\b/gi,
  ma_corpdev:
    /\b(m&a|merger|acquisition|acquire|corp(?:orate)? dev|diligence|synerg|integration)\b/gi,
  strategy_economics:
    /\b(strategy|economics|market|pricing|incentive|competition|margin)\b/gi,
  investment_capital:
    /\b(invest|capital|private equity|venture capital|vc|pe|valuation|funding)\b/gi,
  leadership_operating_model:
    /\b(leadership|ceo|executive|operating model|organisation|organization|governance)\b/gi,
  transformation_execution:
    /\b(transformation|execution|implementation|change programme|delivery)\b/gi,
  entrepreneurship_building:
    /\b(founder|startup|entrepreneur|building|product)\b/gi,
}
export const isPolitical = (s: string) => political.test(s)
export const isCurrentClaim = (s: string) => current.test(s)
export function gateGenerated(s: string, verified = ''): [boolean, string] {
  if (!s?.trim()) return [false, 'empty']
  if (s.length > 9_000) return [false, 'content too long']
  if (sales.test(s)) return [false, 'automated sales outreach']
  if (personal.test(s) && !verified)
    return [false, 'unverified personal transaction claim']
  if (current.test(s) && !verified) return [false, 'research_required']
  return [true, 'ok']
}
export function communityStage(p: CommunityProfile) {
  if (p.banned || p.modWarning) return 'UNKNOWN'
  if (p.acceptedActions >= 8) return 'ESTABLISHED'
  if (p.acceptedActions >= 2) return 'PARTICIPATING'
  if (p.observations >= 5) return 'UNDERSTOOD'
  if (p.observations >= 1) return 'OBSERVING'
  return 'UNKNOWN'
}
export const canParticipate = (p: CommunityProfile) =>
  ['UNDERSTOOD', 'PARTICIPATING', 'ESTABLISHED'].includes(communityStage(p)) &&
  !p.banned &&
  !p.modWarning
export function topic(text: string, source = ''): Topic {
  const s = `${text} ${source}`.toLowerCase()
  let best: Topic = 'human_curiosity',
    n = 0
  for (const [k, r] of Object.entries(terms) as [
    Exclude<Topic, 'human_curiosity'>,
    RegExp,
  ][]) {
    r.lastIndex = 0
    const c = (s.match(r) || []).length
    if (c > n) {
      best = k
      n = c
    }
  }
  return best
}
export function relationshipStage(i = 0, r = 0, c = 0) {
  if (i >= 12 && r >= 4 && c >= 3) return 'STRONG'
  if (i >= 7 && r >= 2) return 'RECURRING'
  if (r >= 1) return 'RECIPROCAL'
  if (i >= 3) return 'ENGAGED'
  if (i >= 1) return 'FAMILIAR'
  return 'DISCOVERED'
}
export const shouldPause = (events: string[]) =>
  events.some(e =>
    ['BAN', 'MOD_WARNING', 'RULE_VIOLATION'].includes(e.toUpperCase()),
  )
export const opportunityStage = (n: number) =>
  n >= 2 ? 'QUALIFIED' : n === 1 ? 'OBSERVED' : 'NONE'
export const detectsOpportunity = (s: string) =>
  /\b(partner|partnership|speaker|speaking|investment|investor|acquisition|vendor|supplier|procurement|rfp|tender|pilot|collaboration|adviser|advisor|hiring|seeking|looking for)\b/i.test(
    s,
  )
export function conversationState(
  text = '',
  removed = false,
  locked = false,
  deleted = false,
) {
  if (deleted) return 'DELETED'
  if (removed) return 'MODERATED'
  if (locked) return 'LOCKED'
  if (
    ['thanks', 'thank you', 'cheers', 'appreciate it', '👍', '🙏'].includes(
      text.trim().toLowerCase(),
    )
  )
    return 'NATURALLY_CLOSED'
  return 'ACTIVE'
}
export const shouldReply = (s: string) =>
  ['ACTIVE', 'OPEN', 'WAITING'].includes(s)
export function similarity(a: string, b: string) {
  const toks = (s: string) => s.toLowerCase().match(/[a-z0-9]{3,}/g) || []
  const count = (x: string[]) => {
    const m = new Map<string, number>()
    for (const t of x) m.set(t, (m.get(t) || 0) + 1)
    return m
  }
  const x = count(toks(a)),
    y = count(toks(b))
  let num = 0,
    dx = 0,
    dy = 0
  for (const v of x.values()) dx += v * v
  for (const v of y.values()) dy += v * v
  for (const [k, v] of x) num += v * (y.get(k) || 0)
  return dx && dy ? num / (Math.sqrt(dx) * Math.sqrt(dy)) : 0
}
export const duplicate = (s: string, recent: string[], threshold = 0.72) =>
  recent.some(x => x && similarity(s, x) >= threshold)
