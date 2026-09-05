import { paperworkAuthSessionSchema } from './schemas'

export async function fetchPaperworkSession() {
  const response = await fetch('/api/auth/session', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    credentials: 'same-origin',
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : `Request failed with status ${response.status}`
    throw new Error(message)
  }

  return paperworkAuthSessionSchema.parse(payload)
}

export function buildPaperworkLoginUrl() {
  return '/api/auth/github/login?return_to=%2F%3Ftab%3Dpaperwork'
}

export function buildPaperworkLogoutUrl() {
  return '/api/auth/logout?return_to=%2F%3Ftab%3Dpaperwork'
}
