import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import type {IncomingMessage, ServerResponse} from 'node:http'
import {context, reddit, redis, settings} from '@devvit/web/server'
import type {
  OnCommentCreateRequest,
  OnCommentDeleteRequest,
  OnModActionRequest,
  OnPostCreateRequest,
  OnPostDeleteRequest,
  PartialJsonValue,
  TriggerResponse,
  UiResponse,
} from '@devvit/web/shared'
import {
  Endpoint,
  EndpointMethod,
  type ErrorRsp,
  type SetEnabledReq,
  type SetModeReq,
  type SocialOsStatusRsp,
} from '../shared/api.ts'
import {getSocialOsState, setSocialOsState} from './db.ts'
import {runObserver} from './observer.ts'
import {
  conversationState,
  conversationWithinLimits,
  shouldContinue,
} from './social/conversation_engine.ts'
import {isCurrentClaim, isPolitical, topic} from './social/core.ts'
import {executeAppAction} from './social/executor.ts'
import {generateContent} from './social/llm.ts'
import {
  getConversation,
  purgeContent,
  purgeRelationship,
  putConversation,
  recordRelationship,
} from './social/memory.ts'
import {openAiKey} from './social/openai.ts'
import {runOriginalPost} from './social/original.ts'
import {researchClaim} from './social/research.ts'
import {
  approveUserAction,
  dismissUserAction,
  listUserQueue,
} from './social/user_queue.ts'

type AnyRsp =
  | SocialOsStatusRsp
  | UiResponse
  | TriggerResponse
  | ErrorRsp
  | Record<string, unknown>
  | unknown[]

export async function onReq(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  try {
    await route(reqMsg, rspMsg)
  } catch (err) {
    console.error(
      'server request failed',
      err instanceof Error ? err.message : String(err),
    )
    writeJson<ErrorRsp>(500, {error: 'request failed', status: 500}, rspMsg)
  }
}

async function route(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  const endpoint = (reqMsg.url?.split('?')[0] ?? '').replace(
    /^\//,
    '',
  ) as Endpoint
  const method = EndpointMethod[endpoint]
  let rsp: AnyRsp
  if (method !== reqMsg.method) rsp = {error: 'not found', status: 404}
  else {
    if (endpoint.startsWith('api/')) await requireModerator()
    switch (endpoint) {
      case Endpoint.Status:
        rsp = await status()
        break
      case Endpoint.SetMode:
        rsp = await setMode(reqMsg)
        break
      case Endpoint.SetEnabled:
        rsp = await setEnabled(reqMsg)
        break
      case Endpoint.UserQueue:
        rsp = await listUserQueue()
        break
      case Endpoint.UserQueueApprove: {
        const req = await readJson<{idempotencyKey: string}>(reqMsg)
        rsp = await approveUserAction(req.idempotencyKey)
        break
      }
      case Endpoint.UserQueueDismiss: {
        const req = await readJson<{idempotencyKey: string}>(reqMsg)
        rsp = await dismissUserAction(req.idempotencyKey)
        break
      }
      case Endpoint.CanaryTest:
        rsp = await runCanaryTest()
        break
      case Endpoint.OnMenuNewPost:
        await requireModerator()
        rsp = await routeMenuNewPost()
        break
      case Endpoint.OnAppInstall:
        rsp = await routeAppInstall()
        break
      case Endpoint.OnObserve:
        await runObserver()
        rsp = {}
        break
      case Endpoint.OnOriginalPost:
        await runOriginalPost()
        rsp = {}
        break
      case Endpoint.OnPostCreate:
      case Endpoint.OnCommentCreate:
        await routeCreateEvent(reqMsg)
        rsp = {}
        break
      case Endpoint.OnPostDelete:
      case Endpoint.OnCommentDelete:
        await routeDeleteEvent(reqMsg)
        rsp = {}
        break
      case Endpoint.OnModAction:
        await routeModAction(reqMsg)
        rsp = {}
        break
      default:
        endpoint satisfies never
        rsp = {error: 'not found', status: 404}
    }
  }
  const statusCode =
    typeof rsp === 'object' && rsp !== null && 'status' in rsp
      ? Number((rsp as {status: unknown}).status)
      : 200
  writeJson<PartialJsonValue>(statusCode, rsp as PartialJsonValue, rspMsg)
}

async function status(): Promise<SocialOsStatusRsp> {
  const state = await getSocialOsState()
  return {
    name: 'Raeburn Social OS',
    platform: 'Reddit',
    ...state,
    openAiConfigured: Boolean(await openAiKey()),
    liveEnabled: Boolean(await settings.get<boolean>('live-enabled')),
  }
}

async function setMode(reqMsg: IncomingMessage): Promise<SocialOsStatusRsp> {
  const req = await readJson<SetModeReq>(reqMsg)
  if (!['OBSERVE', 'SHADOW', 'CANARY', 'LIVE'].includes(req.mode))
    throw new Error('invalid Social OS mode')
  const current = await getSocialOsState()
  if (req.mode === 'LIVE') {
    const liveEnabled = Boolean(await settings.get<boolean>('live-enabled'))
    if (
      !liveEnabled ||
      current.mode !== 'CANARY' ||
      current.canaryActions < 1 ||
      current.failures > 0
    )
      throw new Error('LIVE gate has not been satisfied')
  }
  const state = await setSocialOsState({...current, mode: req.mode})
  return {
    name: 'Raeburn Social OS',
    platform: 'Reddit',
    ...state,
    openAiConfigured: Boolean(await openAiKey()),
    liveEnabled: Boolean(await settings.get<boolean>('live-enabled')),
  }
}

async function setEnabled(reqMsg: IncomingMessage): Promise<SocialOsStatusRsp> {
  const req = await readJson<SetEnabledReq>(reqMsg)
  if (typeof req.enabled !== 'boolean')
    throw new Error('enabled must be boolean')
  const current = await getSocialOsState()
  const state = await setSocialOsState({...current, enabled: req.enabled})
  return {
    name: 'Raeburn Social OS',
    platform: 'Reddit',
    ...state,
    openAiConfigured: Boolean(await openAiKey()),
    liveEnabled: Boolean(await settings.get<boolean>('live-enabled')),
  }
}

async function requireModerator(): Promise<void> {
  if (!context.username || !context.subredditName)
    throw new Error('moderator authentication required')
  const moderators = await reddit
    .getModerators({
      subredditName: context.subredditName,
      username: context.username,
      limit: 1,
      pageSize: 1,
    })
    .all()
  if (
    !moderators.some(
      moderator =>
        moderator.username.toLowerCase() === context.username?.toLowerCase(),
    )
  )
    throw new Error('moderator access required')
}


async function runCanaryTest(): Promise<Record<string, unknown>> {
  const state = await getSocialOsState()
  if (!state.enabled) throw new Error('Social OS is disabled')
  if (state.mode !== 'CANARY')
    throw new Error('Canary test requires CANARY mode')
  if (!context.subredditName) throw new Error('subreddit context required')
  if (state.canaryActions >= 1)
    throw new Error('Canary action already completed')

  const generated = await generateContent({
    text: [
      'Canary validation discussion for the Raeburn Social OS.',
      'How should an autonomous software system balance useful automation, implementation constraints, governance, economics and human oversight?',
      'Discuss the trade-offs and practical architecture. This is an evergreen engineering test; do not introduce current factual claims.',
    ].join(' '),
    subreddit: context.subredditName,
    topic: 'technology_ai',
  })
  if (generated.action !== 'COMMENT' || !generated.body)
    return {executed: false, reason: generated.rationale}

  const post = await reddit.submitPost({
    subredditName: context.subredditName,
    title: 'Raeburn Social OS — Canary validation',
    text: 'Controlled development-only validation thread for the Social OS Canary execution path.',
    runAs: 'APP',
  })
  const result = await executeAppAction(
    {
      idempotencyKey: 'canary-validation-v1',
      action: 'COMMENT',
      targetId: post.id,
      subreddit: context.subredditName,
      body: generated.body,
      identity: 'APP',
      author: 'raeburn-social-os-canary',
      topic: 'technology_ai',
      generatedAt: new Date().toISOString(),
    },
    {moderationRisk: false, researchRequired: false, researchVerified: true},
  )
  return {
    executed: result.executed,
    reason: result.reason,
    redditId: result.redditId,
    testPostId: post.id,
  }
}

async function routeMenuNewPost(): Promise<UiResponse> {
  const post = await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: 'Raeburn Social OS',
  })
  return {
    showToast: {
      text: 'Raeburn Social OS console created.',
      appearance: 'success',
    },
    navigateTo: post.url,
  }
}

async function routeAppInstall(): Promise<TriggerResponse> {
  await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: 'Raeburn Social OS',
  })
  return {}
}

async function routeCreateEvent(reqMsg: IncomingMessage): Promise<void> {
  const payload = await readJson<OnPostCreateRequest | OnCommentCreateRequest>(
    reqMsg,
  )
  if (!('comment' in payload) || !payload.comment) return

  const {comment} = payload
  const eventKey = `social-os:event:comment-create:${comment.id}`
  const token = randomUUID()
  await redis.set(eventKey, token, {
    nx: true,
    expiration: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  })
  if ((await redis.get(eventKey)) !== token) return

  const author = payload.author?.name || comment.author
  if (payload.author?.accountType === 3) return
  const appUser = await reddit.getAppUser()
  if (
    !author ||
    author === '[deleted]' ||
    author.toLowerCase() === appUser?.username.toLowerCase()
  )
    return
  if (!(await redis.get(`social-os:owned:${comment.parentId}`))) return

  const subreddit = payload.subreddit?.name || context.subredditName
  const existing = await getConversation(comment.postId)
  if (!existing || existing.ourLastActionId !== comment.parentId) return

  const state = conversationState({
    body: comment.body,
    locked: payload.post?.isLocked,
    deleted: comment.deleted,
  })
  await putConversation({
    ...existing,
    state,
    participants: Array.from(new Set([...existing.participants, author])),
    lastEventAt: new Date().toISOString(),
  })
  await recordRelationship(author, {interactions: 1, reciprocalReplies: 1})

  if (
    !shouldContinue(state) ||
    !conversationWithinLimits(existing) ||
    isPolitical(comment.body)
  )
    return

  const researchRequired = isCurrentClaim(comment.body)
  const research = researchRequired
    ? await researchClaim(comment.body)
    : {verified: true, evidence: [], reason: 'research not required'}
  if (researchRequired && !research.verified) return

  const classifiedTopic = topic(comment.body, subreddit)
  const generated = await generateContent({
    text: comment.body,
    subreddit,
    topic: classifiedTopic,
    evidence: research.evidence,
  })
  if (generated.action !== 'COMMENT' || !generated.body) return

  const result = await executeAppAction(
    {
      idempotencyKey: `reply:${comment.id}`,
      action: 'COMMENT',
      targetId: comment.id,
      subreddit,
      body: generated.body,
      identity: 'APP',
      author,
      topic: classifiedTopic,
      generatedAt: new Date().toISOString(),
    },
    {
      moderationRisk: false,
      researchRequired,
      researchVerified: research.verified,
    },
  )
  if (!result.executed) return

  await putConversation({
    ...existing,
    state: 'ACTIVE',
    participants: Array.from(new Set([...existing.participants, author])),
    lastEventAt: new Date().toISOString(),
    ourLastActionId: result.redditId,
    replyCount: (existing.replyCount ?? 0) + 1,
    lastReplyAt: new Date().toISOString(),
  })
  await recordRelationship(author, {substantiveReplies: 1})
}

async function routeDeleteEvent(reqMsg: IncomingMessage): Promise<void> {
  const payload = await readJson<OnPostDeleteRequest | OnCommentDeleteRequest>(
    reqMsg,
  )
  const id = 'commentId' in payload ? payload.commentId : payload.postId
  if (id) await purgeContent(id)
  if ('postId' in payload && payload.postId && payload.postId !== id) {
    await purgeContent(payload.postId)
  }
  if (payload.author?.name) await purgeRelationship(payload.author.name)
}

async function routeModAction(reqMsg: IncomingMessage): Promise<void> {
  const payload = await readJson<OnModActionRequest>(reqMsg)
  const action = payload.action?.toLowerCase() ?? ''
  if (!/^(remove|spam|lock)(link|comment)?$/.test(action)) return
  const targetId = payload.targetComment?.id ?? payload.targetPost?.id
  if (!targetId || !(await redis.get(`social-os:owned:${targetId}`))) return

  const current = await getSocialOsState()
  await setSocialOsState({...current, enabled: false})
  const threadId = payload.targetComment?.postId ?? payload.targetPost?.id
  if (threadId) {
    const conversation = await getConversation(threadId)
    if (conversation)
      await putConversation({
        ...conversation,
        state: 'MODERATED',
        lastEventAt: new Date().toISOString(),
      })
  }
  await redis.set(
    'social-os:moderation:last',
    JSON.stringify({
      at: new Date().toISOString(),
      action,
      targetId,
      moderator: payload.moderator?.name,
    }),
    {expiration: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)},
  )
}

async function readJson<T>(reqMsg: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = []
  let length = 0
  reqMsg.on('data', chunk => {
    length += chunk.length
    if (length > 1_000_000) reqMsg.destroy(new Error('request too large'))
    else chunks.push(chunk)
  })
  await once(reqMsg, 'end')
  return JSON.parse(`${Buffer.concat(chunks)}`) as T
}

function writeJson<T extends PartialJsonValue>(
  statusCode: number,
  json: Readonly<T>,
  rsp: ServerResponse,
): void {
  const body = JSON.stringify(json)
  rsp.writeHead(statusCode, {
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  })
  rsp.end(body)
}
