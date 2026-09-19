export type ErrorRsp = {error: string; status: number}
export type SocialOsMode = 'OBSERVE' | 'SHADOW' | 'CANARY' | 'LIVE'
export type SocialOsStatusRsp = {
  name: 'Raeburn Social OS'
  platform: 'Reddit'
  mode: SocialOsMode
  enabled: boolean
  decisions: number
  actions: number
  holds: number
  noActions: number
  shadowProposals: number
  shadowComments: number
}
export type SetModeReq = {mode: SocialOsMode}
export type Endpoint = (typeof Endpoint)[keyof typeof Endpoint]
export const Endpoint = {
  Status: 'api/social-os/status',
  SetMode: 'api/social-os/mode',
  OnMenuNewPost: 'internal/on/menu/new-post',
  OnAppInstall: 'internal/on/app/install',
  OnObserve: 'internal/scheduler/observe',
} as const
export const EndpointMethod = {
  [Endpoint.Status]: 'GET',
  [Endpoint.SetMode]: 'POST',
  [Endpoint.OnAppInstall]: 'POST',
  [Endpoint.OnMenuNewPost]: 'POST',
  [Endpoint.OnObserve]: 'POST',
} as const satisfies {[endpoint: string]: 'GET' | 'POST'}
