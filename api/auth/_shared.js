import crypto from 'node:crypto'

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_USER_URL = 'https://api.github.com/user'
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails'

const SESSION_COOKIE_NAME = 'paperwork_session'
const STATE_COOKIE_NAME = 'paperwork_oauth_state'
const SESSION_TTL_SECONDS = 60 * 60 * 12
const STATE_TTL_SECONDS = 60 * 10

export function getGitHubAuthConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim()
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim()
  const sessionSecret = process.env.PAPERWORK_SESSION_SECRET?.trim()

  if (!clientId || !clientSecret || !sessionSecret) {
    throw new Error('Missing GitHub OAuth configuration in Vercel environment variables.')
  }

  return {
    clientId,
    clientSecret,
    sessionSecret,
  }
}

export function buildAuthorizeUrl({ clientId, redirectUri, state }) {
  const url = new URL(GITHUB_AUTHORIZE_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', 'read:user user:email')
  url.searchParams.set('state', state)
  return url.toString()
}

export function createStateCookieValue(returnTo, secret) {
  return signPayload(
    {
      state: createRandomToken(),
      returnTo: sanitizeReturnTo(returnTo),
      exp: Math.floor(Date.now() / 1_000) + STATE_TTL_SECONDS,
    },
    secret,
  )
}

export function readStateCookie(req, secret) {
  const cookies = parseCookies(req)
  return verifySignedPayload(cookies[STATE_COOKIE_NAME], secret)
}

export async function exchangeCodeForToken({ code, clientId, clientSecret, redirectUri }) {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'trii-jsx-paperwork-auth',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.access_token) {
    const message = typeof payload?.error_description === 'string' ? payload.error_description : 'GitHub token exchange failed.'
    throw new Error(message)
  }

  return payload.access_token
}

export async function fetchGitHubIdentity(accessToken) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'trii-jsx-paperwork-auth',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  const [userResponse, emailsResponse] = await Promise.all([
    fetch(GITHUB_USER_URL, { headers }),
    fetch(GITHUB_EMAILS_URL, { headers }),
  ])

  const user = await userResponse.json().catch(() => null)
  const emails = await emailsResponse.json().catch(() => [])

  if (!userResponse.ok || !user?.login) {
    throw new Error('Could not read GitHub user profile.')
  }

  const primaryVerifiedEmail = Array.isArray(emails)
    ? emails.find((entry) => entry?.verified && (entry?.primary || typeof entry?.visibility === 'string'))?.email
    : null

  return {
    login: String(user.login),
    name: typeof user.name === 'string' ? user.name : null,
    avatarUrl: typeof user.avatar_url === 'string' ? user.avatar_url : null,
    email:
      typeof primaryVerifiedEmail === 'string'
        ? primaryVerifiedEmail
        : typeof user.email === 'string'
          ? user.email
          : null,
  }
}

export function assertGitHubUserAllowed(identity) {
  const allowedLogins = parseCsvEnv(process.env.PAPERWORK_GITHUB_ALLOWED_LOGINS)
  const allowedEmails = parseCsvEnv(process.env.PAPERWORK_GITHUB_ALLOWED_EMAILS)

  if (allowedLogins.size === 0 && allowedEmails.size === 0) {
    throw new Error('Missing Paperwork GitHub allowlist configuration.')
  }

  const normalizedLogin = identity.login.trim().toLowerCase()
  const normalizedEmail = identity.email?.trim().toLowerCase() ?? null

  if (allowedLogins.has(normalizedLogin)) {
    return
  }

  if (normalizedEmail && allowedEmails.has(normalizedEmail)) {
    return
  }

  const error = new Error('This GitHub account is not allowed to access Paperwork.')
  error.statusCode = 403
  throw error
}

export function createSessionCookieValue(identity, secret) {
  return signPayload(
    {
      login: identity.login,
      name: identity.name,
      avatarUrl: identity.avatarUrl,
      email: identity.email,
      exp: Math.floor(Date.now() / 1_000) + SESSION_TTL_SECONDS,
    },
    secret,
  )
}

export function readSession(req, secret) {
  const cookies = parseCookies(req)
  return verifySignedPayload(cookies[SESSION_COOKIE_NAME], secret)
}

export function clearSessionCookies(res) {
  const cookieSuffix = buildCookieSuffix(getCookieContext(res))
  appendSetCookie(res, `${SESSION_COOKIE_NAME}=; ${cookieSuffix}; Max-Age=0`)
  appendSetCookie(res, `${STATE_COOKIE_NAME}=; ${cookieSuffix}; Max-Age=0`)
}

export function setStateCookie(res, signedValue) {
  const cookieSuffix = buildCookieSuffix(getCookieContext(res))
  appendSetCookie(
    res,
    `${STATE_COOKIE_NAME}=${signedValue}; ${cookieSuffix}; Max-Age=${STATE_TTL_SECONDS}`,
  )
}

export function setSessionCookie(res, signedValue) {
  const cookieSuffix = buildCookieSuffix(getCookieContext(res))
  appendSetCookie(
    res,
    `${SESSION_COOKIE_NAME}=${signedValue}; ${cookieSuffix}; Max-Age=${SESSION_TTL_SECONDS}`,
  )
}

export function redirect(res, location) {
  res.statusCode = 302
  res.setHeader('Location', location)
  res.end()
}

export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export function sanitizeReturnTo(value) {
  if (typeof value !== 'string') {
    return '/?tab=paperwork'
  }

  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return '/?tab=paperwork'
  }

  return trimmed
}

export function getRequestOrigin(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${protocol}://${host}`
}

export function resolveRedirectUri(req) {
  const origin = getRequestOrigin(req)
  return `${origin}/api/auth/github/callback`
}

function createRandomToken() {
  return crypto.randomBytes(24).toString('base64url')
}

function signPayload(payload, secret) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url')
  return `${encodedPayload}.${signature}`
}

function verifySignedPayload(rawValue, secret) {
  if (!rawValue || typeof rawValue !== 'string') {
    return null
  }

  const separatorIndex = rawValue.lastIndexOf('.')
  if (separatorIndex <= 0) {
    return null
  }

  const encodedPayload = rawValue.slice(0, separatorIndex)
  const providedSignature = rawValue.slice(separatorIndex + 1)
  const expectedSignature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url')

  if (!timingSafeEqual(providedSignature, expectedSignature)) {
    return null
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  if (!payload || typeof payload !== 'object') {
    return null
  }

  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1_000)) {
    return null
  }

  return payload
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function parseCookies(req) {
  const rawCookie = req.headers.cookie || ''
  return rawCookie.split(';').reduce((accumulator, entry) => {
    const separatorIndex = entry.indexOf('=')
    if (separatorIndex === -1) {
      return accumulator
    }

    const key = entry.slice(0, separatorIndex).trim()
    const value = entry.slice(separatorIndex + 1).trim()
    if (key) {
      accumulator[key] = decodeURIComponent(value)
    }
    return accumulator
  }, {})
}

function appendSetCookie(res, cookieValue) {
  const current = res.getHeader('Set-Cookie')
  if (!current) {
    res.setHeader('Set-Cookie', [cookieValue])
    return
  }

  const next = Array.isArray(current) ? [...current, cookieValue] : [String(current), cookieValue]
  res.setHeader('Set-Cookie', next)
}

function getCookieContext(res) {
  const req = res.req
  const protocol = req?.headers?.['x-forwarded-proto'] || 'https'
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host || ''

  return {
    secure: String(protocol).toLowerCase() === 'https' && !String(host).toLowerCase().startsWith('localhost:'),
  }
}

function buildCookieSuffix(context) {
  return context.secure
    ? 'Path=/; HttpOnly; SameSite=Lax; Secure'
    : 'Path=/; HttpOnly; SameSite=Lax'
}

function parseCsvEnv(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  )
}
