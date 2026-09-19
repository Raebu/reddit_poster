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
  canaryActions: number
  liveActions: number
  failures: number
  lastRunAt?: string
  lastActionAt?: string
}
export type SetModeReq = {mode: SocialOsMode}
export type SetEnabledReq = {enabled: boolean}
export type Endpoint = (typeof Endpoint)[keyof typeof Endpoint]
export const Endpoint = {
  Status: 'api/social-os/status',
  SetMode: 'api/social-os/mode',
  SetEnabled: 'api/social-os/enabled',
  UserQueue: 'api/social-os/user-queue',
  OnMenuNewPost: 'internal/on/menu/new-post',
  OnAppInstall: 'internal/on/app/install',
  OnObserve: 'internal/scheduler/observe',
  OnOriginalPost: 'internal/scheduler/original-post',
  OnPostCreate: 'internal/on/post-create',
  OnPostDelete: 'internal/on/post-delete',
  OnCommentCreate: 'internal/on/comment-create',
  OnCommentDelete: 'internal/on/comment-delete',
  OnModAction: 'internal/on/mod-action',
} as const
export const EndpointMethod = {
  [Endpoint.Status]: 'GET',
  [Endpoint.SetMode]: 'POST',
  [Endpoint.SetEnabled]: 'POST',
  [Endpoint.UserQueue]: 'GET',
  [Endpoint.OnAppInstall]: 'POST',
  [Endpoint.OnMenuNewPost]: 'POST',
  [Endpoint.OnObserve]: 'POST',
  [Endpoint.OnOriginalPost]: 'POST',
  [Endpoint.OnPostCreate]: 'POST',
  [Endpoint.OnPostDelete]: 'POST',
  [Endpoint.OnCommentCreate]: 'POST',
  [Endpoint.OnCommentDelete]: 'POST',
  [Endpoint.OnModAction]: 'POST',
} as const satisfies {[endpoint: string]: 'GET' | 'POST'}
