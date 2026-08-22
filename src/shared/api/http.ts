import { env } from '../config/env'

export class HttpError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export function isRetryableHttpError(error: unknown) {
  if (error instanceof HttpError) {
    return error.status === 408 || error.status === 425 || error.status === 429 || error.status === 500 || error.status === 502 || error.status === 503 || error.status === 504
  }

  return error instanceof TypeError
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

export async function postJson<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')

  if (env.apiToken) {
    headers.set('X-Api-Token', env.apiToken)
  }

  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...init,
    method: 'POST',
    headers,
    body: JSON.stringify(body),
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
