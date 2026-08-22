import { env } from '../config/env'

export class HttpError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')

  if (env.apiToken) {
    headers.set('X-Api-Token', env.apiToken)
  }

  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...init,
    method: 'GET',
    headers,
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : `Request failed with status ${response.status}`
    throw new HttpError(message, response.status)
  }

  return payload as T
}
