import {once} from 'node:events'
import type {IncomingMessage, ServerResponse} from 'node:http'
import {reddit} from '@devvit/web/server'
import type {
  PartialJsonValue,
  TriggerResponse,
  UiResponse,
} from '@devvit/web/shared'
import {
  Endpoint,
  EndpointMethod,
  type ErrorRsp,
  type SetModeReq,
  type SocialOsStatusRsp,
} from '../shared/api.ts'
import {getSocialOsState, setSocialOsState} from './db.ts'

type AnyRsp = SocialOsStatusRsp | UiResponse | TriggerResponse | ErrorRsp

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

  if (method !== reqMsg.method) {
    rsp = {error: 'not found', status: 404}
  } else {
    switch (endpoint) {
      case Endpoint.Status:
        rsp = await status()
        break

      case Endpoint.SetMode:
        rsp = await setMode(reqMsg)
        break

      case Endpoint.OnMenuNewPost:
        rsp = await routeMenuNewPost()
        break

      case Endpoint.OnAppInstall:
        rsp = await routeAppInstall()
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

  return {
    name: 'Raeburn Social OS',
    platform: 'Reddit',
    ...state,
  }
}

async function setMode(reqMsg: IncomingMessage): Promise<SocialOsStatusRsp> {
  const req = await readJson<SetModeReq>(reqMsg)

  if (!['OBSERVE', 'SHADOW', 'CANARY', 'LIVE'].includes(req.mode)) {
    throw new Error('invalid Social OS mode')
  }

  const current = await getSocialOsState()
  const state = await setSocialOsState({...current, mode: req.mode})

  return {
    name: 'Raeburn Social OS',
    platform: 'Reddit',
    ...state,
  }
}

async function routeMenuNewPost(): Promise<UiResponse> {
  const post = await reddit.submitCustomPost({
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
    title: 'Raeburn Social OS',
  })
  return {}
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
