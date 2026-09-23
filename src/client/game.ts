import {request} from './fetch.ts'

type Status = {
  name: string
  platform: string
  mode: string
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
  openAiConfigured: boolean
  liveEnabled: boolean
  lastRunAt?: string
  lastActionAt?: string
}

type UserQueueItem = {
  idempotencyKey: string
  action: string
  subreddit: string
  body: string
  title?: string
  queuedAt: string
  status: string
  requestedBy?: {id: string; username: string}
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const root = document.body

root.innerHTML = `
  <main style="
    font-family: system-ui, sans-serif;
    max-width: 820px;
    margin: 12px auto;
    padding: 16px;
    box-sizing: border-box;
    line-height: 1.5;
  ">
    <h1 style="margin-bottom:4px">Raeburn Social OS</h1>
    <p style="margin-top:0;opacity:.7">Reddit production autonomy console</p>

    <section style="border:2px solid #111;border-radius:12px;padding:14px;margin:16px 0">
    <strong>Autonomy mode</strong>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button data-mode="OBSERVE">Observe</button>
      <button data-mode="SHADOW">Shadow</button>
      <button data-mode="CANARY">Canary</button>
      <button data-mode="LIVE">Live</button>
    </div>
    <p style="margin:8px 0 0;opacity:.7;font-size:.9rem">Use Canary for the first real, tightly limited APP action. LIVE stays locked until the Canary gate is satisfied.</p>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button id="enable">Enable</button>
      <button id="disable">Kill switch</button>
      <button id="refresh">Refresh</button>
    </div>
    </section>

    <div id="status">Loading…</div>

    <hr style="margin:16px 0">

    <strong>USER action queue</strong>
    <div id="queue" style="margin-top:12px">Loading…</div>
  </main>
`

async function load(): Promise<void> {
  const state = await request<Status>('/api/social-os/status')
  const queue = await request<UserQueueItem[]>('/api/social-os/user-queue')

  const status = document.querySelector('#status')
  if (status) {
    status.innerHTML = `
      <p><strong>Status:</strong> ${state.enabled ? 'Enabled' : 'Disabled'}</p>
      <p><strong>Mode:</strong> ${escapeHtml(state.mode)}</p>
      <p><strong>OpenAI:</strong> ${state.openAiConfigured ? 'Configured' : 'Not configured'}</p>
      <p><strong>LIVE gate:</strong> ${state.liveEnabled ? 'Enabled' : 'Locked'}</p>
      <p>
        Decisions: ${state.decisions} ·
        Actions: ${state.actions} ·
        Holds: ${state.holds} ·
        No action: ${state.noActions}
      </p>
      <p>
        Shadow proposals: ${state.shadowProposals} ·
        Shadow comments: ${state.shadowComments}
      </p>
      <p>
        Canary actions: ${state.canaryActions} ·
        Live actions: ${state.liveActions} ·
        Failures: ${state.failures}
      </p>
      <p><strong>Last hosted run:</strong> ${escapeHtml(state.lastRunAt ?? 'Not yet')}</p>
      <p><strong>Last action:</strong> ${escapeHtml(state.lastActionAt ?? 'Not yet')}</p>
    `
  }

  const liveButton =
    document.querySelector<HTMLButtonElement>('[data-mode="LIVE"]')
  if (liveButton) liveButton.disabled = !state.liveEnabled

  const queueNode = document.querySelector('#queue')
  if (queueNode) {
    queueNode.innerHTML = queue.length
      ? queue
          .map(
            item => `
            <article style="border:1px solid #ddd;padding:12px;margin:8px 0;border-radius:8px">
              <strong>${escapeHtml(item.action)}</strong> in r/${escapeHtml(item.subreddit)}
              <p style="white-space:pre-wrap">${escapeHtml(item.title ? `${item.title}\n\n${item.body}` : item.body)}</p>
              <small>${escapeHtml(item.status)} · ${escapeHtml(item.queuedAt)}</small>
              ${item.status === 'PENDING' ? `<p><strong>This will post once as u/${escapeHtml(item.requestedBy?.username ?? 'your account')}.</strong></p><div style="margin-top:8px"><button data-approve="${escapeHtml(item.idempotencyKey)}">Post once as me</button> <button data-dismiss="${escapeHtml(item.idempotencyKey)}">Dismiss</button></div>` : ''}
            </article>
          `,
          )
          .join('')
      : '<p>No USER actions queued.</p>'
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '[data-approve]',
  )) {
    button.addEventListener('click', async () => {
      if (
        !window.confirm(
          'Post the displayed content once from your Reddit account?',
        )
      )
        return
      await request('/api/social-os/user-queue/approve', {
        method: 'POST',
        body: JSON.stringify({idempotencyKey: button.dataset.approve}),
      })
      await load()
    })
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '[data-dismiss]',
  )) {
    button.addEventListener('click', async () => {
      await request('/api/social-os/user-queue/dismiss', {
        method: 'POST',
        body: JSON.stringify({idempotencyKey: button.dataset.dismiss}),
      })
      await load()
    })
  }
}

for (const button of document.querySelectorAll<HTMLButtonElement>(
  '[data-mode]',
)) {
  button.addEventListener('click', async () => {
    const mode = button.dataset.mode
    if (!mode) return
    await request('/api/social-os/mode', {
      method: 'POST',
      body: JSON.stringify({mode}),
    })
    await load()
  })
}

document.querySelector('#enable')?.addEventListener('click', async () => {
  await request('/api/social-os/enabled', {
    method: 'POST',
    body: JSON.stringify({enabled: true}),
  })
  await load()
})

document.querySelector('#disable')?.addEventListener('click', async () => {
  await request('/api/social-os/enabled', {
    method: 'POST',
    body: JSON.stringify({enabled: false}),
  })
  await load()
})

document.querySelector('#refresh')?.addEventListener('click', () => void load())

void load()
