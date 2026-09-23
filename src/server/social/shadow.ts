import {canParticipate, isCurrentClaim, isPolitical, topic} from './core.ts'

export type ShadowAction = 'COMMENT' | 'POST' | 'NO_ACTION' | 'HOLD'
export type ShadowInput = {
  text: string
  subreddit: string
  community: {
    observations: number
    acceptedActions: number
    modWarning?: boolean
    banned?: boolean
  }
  score?: number
  comments?: number
  researchVerified?: boolean
}
export type ShadowDecision = {
  action: ShadowAction
  reason: string
  score: number
  topic: ReturnType<typeof topic>
  draft?: string
}

const substantive =
  /\b(why|how|trade-?off|implementation|execution|architecture|economics|incentive|strategy|integration|governance|risk|cost|margin|adoption)\b/i
const question = /\?/
const lowSignal = /\b(meme|lol|lmao|rate my|roast|giveaway)\b/i

export function shadowDecision(input: ShadowInput): ShadowDecision {
  const text = input.text.trim()
  const classifiedTopic = topic(text, input.subreddit)
  if (isPolitical(text))
    return {
      action: 'NO_ACTION',
      reason: 'political restraint',
      score: 0,
      topic: classifiedTopic,
    }
  if (isCurrentClaim(text) && !input.researchVerified)
    return {
      action: 'HOLD',
      reason: 'current claim requires verified research',
      score: 0,
      topic: classifiedTopic,
    }
  if (!canParticipate(input.community))
    return {
      action: 'NO_ACTION',
      reason: 'community not yet understood',
      score: 0,
      topic: classifiedTopic,
    }
  if (text.length < 120 || lowSignal.test(text))
    return {
      action: 'NO_ACTION',
      reason: 'insufficient substantive value',
      score: 0,
      topic: classifiedTopic,
    }

  let score = 0
  if (classifiedTopic !== 'human_curiosity') score += 3
  if (substantive.test(text)) score += 2
  if (question.test(text)) score += 1
  if ((input.comments ?? 0) >= 5 && (input.comments ?? 0) <= 80) score += 1
  if ((input.score ?? 0) >= 3) score += 1
  if (text.length >= 300) score += 1

  if (score >= 6)
    return {
      action: 'COMMENT',
      reason: 'high-value discussion candidate',
      score,
      topic: classifiedTopic,
      draft: draftSeed(classifiedTopic),
    }
  if (score >= 4)
    return {
      action: 'NO_ACTION',
      reason: 'relevant but below autonomous contribution threshold',
      score,
      topic: classifiedTopic,
    }
  return {
    action: 'NO_ACTION',
    reason: 'value threshold not met',
    score,
    topic: classifiedTopic,
  }
}

function draftSeed(t: ReturnType<typeof topic>): string {
  const seeds: Record<ReturnType<typeof topic>, string> = {
    technology_ai:
      'Focus on the implementation constraint, who operates the system, and what changes economically when it works.',
    ma_corpdev:
      'Focus on integration mechanics, incentives, execution risk, and where the expected value can disappear after the deal.',
    strategy_economics:
      'Focus on incentives, constraints, second-order effects, and the mechanism connecting strategy to an outcome.',
    investment_capital:
      'Focus on capital efficiency, incentives, downside, and what would have to be true for the economics to work.',
    leadership_operating_model:
      'Focus on decision rights, incentives, operating cadence, and the human consequences of the structure.',
    transformation_execution:
      'Focus on the gap between the plan and implementation: ownership, sequencing, adoption, and measurable outcomes.',
    entrepreneurship_building:
      'Focus on the user problem, distribution, economics, and the practical constraint most likely to break the plan.',
    human_curiosity:
      'Add one specific observation or useful question; do not manufacture expertise or a personal anecdote.',
  }
  return seeds[t]
}
