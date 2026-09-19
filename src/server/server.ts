import {once} from 'node:events'
import type {IncomingMessage, ServerResponse} from 'node:http'
import {reddit, redis} from '@devvit/web/server'
import type {
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
import {conversationState} from './social/conversation_engine.ts'
import {
  getConversation,
  putConversation,
  purgeContent,
  recordRelationship,
} from './social/memory.ts'
import {listUserQueue} from './social/user_queue.ts'

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
    const msg = `server error; ${err instanceof Error ? err.stack : err}`
    console.error(msg)
    writeJson<ErrorRsp>(500, {error: msg, status: 500}, rspMsg)
  }
}

async function route(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  const endpoint = reqMsg.url?.slice(1) as Endpoint
  const method = EndpointMethod[endpoint]
  let rsp: AnyRsp
  if (method !== reqMsg.method) rsp = {error: 'not found', status: 404}
  else {
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
      case Endpoint.OnMenuNewPost:
        rsp = await routeMenuNewPost()
        break
      case Endpoint.OnAppInstall:
        rsp = await routeAppInstall()
        break
      case Endpoint.OnObserve:
        await runObserver()
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
  writeJson<PartialJsonValue>('status' in rsp ? rsp.status : 200, rsp, rspMsg)
}

async function status(): Promise<SocialOsStatusRsp> {
  const state = await getSocialOsState()
  return {name: 'Raeburn Social OS', platform: 'Reddit', ...state}
}

async function setMode(reqMsg: IncomingMessage): Promise<SocialOsStatusRsp> {
  const req = await readJson<SetModeReq>(reqMsg)
  if (!['OBSERVE', 'SHADOW', 'CANARY', 'LIVE'].includes(req.mode))
    throw new Error('invalid Social OS mode')
  const current = await getSocialOsState()
  const state = await setSocialOsState({...current, mode: req.mode})
  return {name: 'Raeburn Social OS', platform: 'Reddit', ...state}
}

async function setEnabled(
  reqMsg: IncomingMessage,
): Promise<SocialOsStatusRsp> {
  const req = await readJson<SetEnabledReq>(reqMsg)
  const current = await getSocialOsState()
  const state = await setSocialOsState({...current, enabled: req.enabled})
  return {name: 'Raeburn Social OS', platform: 'Reddit', ...state}
}

async function routeMenuNewPost(): Promise<UiResponse> {
  const post = await reddit.submitCustomPost({title: 'Raeburn Social OS'})
  return {
    showToast: {
      text: 'Raeburn Social OS console created.',
      appearance: 'success',
    },
    navigateTo: post.url,
  }
}

async function routeAppInstall(): Promise<TriggerResponse> {
  await reddit.submitCustomPost({title: 'Raeburn Social OS'})
  return {}
}

async function routeCreateEvent(reqMsg: IncomingMessage): Promise<void> {
  const payload = await readJson<Record<string, unknown>>(reqMsg)
  const event = (payload.event ?? payload) as Record<string, unknown>
  const post = (event.post ?? {}) as Record<string, unknown>
  const comment = (event.comment ?? {}) as Record<string, unknown>
  const id = String(comment.id ?? post.id ?? event.id ?? '')
  if (!id) return
  const parentId = String(
    comment.postId ?? comment.parentId ?? post.id ?? event.postId ?? id,
  )
  const subreddit = String(
    comment.subredditName ??
      post.subredditName ??
      event.subredditName ??
      'unknown',
  )
  const author = String(
    comment.authorName ?? post.authorName ?? event.authorName ?? 'unknown',
  )
  const body = String(comment.body ?? post.body ?? post.title ?? '')
  const existing = await getConversation(parentId)
  const state = conversationState({body})
  await putConversation({
    threadId: parentId,
    subreddit,
    state,
    participants: Array.from(
      new Set([...(existing?.participants ?? []), author].filter(Boolean)),
    ),
    lastEventAt: new Date().toISOString(),
    ourLastActionId: existing?.ourLastActionId,
  })
  if (author && author !== 'unknown')
    await recordRelationship(author, {
      interactions: 1,
      reciprocalReplies: existing?.ourLastActionId ? 1 : 0,
    })
}

async function routeDeleteEvent(reqMsg: IncomingMessage): Promise<void> {
  const payload = await readJson<Record<string, unknown>>(reqMsg)
  const event = (payload.event ?? payload) as Record<string, unknown>
  const id = String(
    (event.post as Record<string, unknown> | undefined)?.id ??
      (event.comment as Record<string, unknown> | undefined)?.id ??
      event.id ??
      '',
  )
  if (id) await purgeContent(id)
}

async function routeModAction(reqMsg: IncomingMessage): Promise<void> {
  const payload = await readJson<Record<string, unknown>>(reqMsg)
  const raw = JSON.stringify(payload)
  const risky = /ban|remove|warning|violation/i.test(raw)
  if (risky) {
    const current = await getSocialOsState()
    await setSocialOsState({...current, enabled: false})
    await redis.set(
      'social-os:moderation:last',
      JSON.stringify({at: new Date().toISOString(), payload}),
    )
  }
}

async function readJson<T>(reqMsg: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = []
  reqMsg.on('data', chunk => chunks.push(chunk))
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
  })
  rsp.end(body)
}
