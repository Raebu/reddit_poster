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
}

const root = document.body

root.innerHTML = `
  <main style="
    font-family: system-ui, sans-serif;
    max-width: 720px;
    margin: 40px auto;
    padding: 28px;
    line-height: 1.5;
  ">
    <h1 style="margin-bottom:4px">Raeburn Social OS</h1>
    <p style="margin-top:0;opacity:.7">Reddit intelligence console</p>

    <div id="status">Loading…</div>

    <hr style="margin:24px 0">

    <strong>Autonomy mode</strong>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button data-mode="OBSERVE">Observe</button>
      <button data-mode="SHADOW">Shadow</button>
      <button data-mode="CANARY">Canary</button>
      <button data-mode="LIVE">Live</button>
    </div>
  </main>
`

async function load(): Promise<void> {
  const state = await request<Status>('/api/social-os/status')

  const status = document.querySelector('#status')
  if (!status) return

  status.innerHTML = `
    <p><strong>Status:</strong> ${state.enabled ? 'Enabled' : 'Disabled'}</p>
    <p><strong>Mode:</strong> ${state.mode}</p>
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
  `
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

void load()
