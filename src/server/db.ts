import {redis} from '@devvit/web/server'

export type SocialOsState = {
  mode: 'OBSERVE' | 'SHADOW' | 'CANARY' | 'LIVE'
  enabled: boolean
  decisions: number
  actions: number
  holds: number
  noActions: number
  shadowProposals: number
  shadowComments: number
}

const STATE_KEY = 'social-os:state'

const defaults: SocialOsState = {
  mode: 'OBSERVE',
  enabled: true,
  decisions: 0,
  actions: 0,
  holds: 0,
  noActions: 0,
  shadowProposals: 0,
  shadowComments: 0,
}

export async function getSocialOsState(): Promise<SocialOsState> {
  const raw = await redis.get(STATE_KEY)
  if (!raw) return {...defaults}
  return {...defaults, ...(JSON.parse(raw) as Partial<SocialOsState>)}
}

export async function setSocialOsState(
  state: SocialOsState,
): Promise<SocialOsState> {
  await redis.set(STATE_KEY, JSON.stringify(state))
  return state
}
