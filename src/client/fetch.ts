export async function request<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const raw = await response.text()
  let payload: unknown
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = raw
  }

  if (!response.ok) {
    const detail =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof (payload as {error?: unknown}).error === 'string'
        ? (payload as {error: string}).error
        : raw || `HTTP ${response.status}`
    throw new Error(detail)
  }

  return payload as T
}
