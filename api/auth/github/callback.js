import {
  assertGitHubIdentityHasEmail,
  assertGitHubUserAllowed,
  clearSessionCookies,
  createSessionCookieValue,
  exchangeCodeForToken,
  fetchGitHubIdentity,
  getGitHubAuthConfig,
  getRequestOrigin,
  readStateCookie,
  redirect,
  resolveRedirectUri,
  setSessionCookie,
} from '../_shared.js'

export default async function handler(req, res) {
  try {
    const { clientId, clientSecret, sessionSecret } = getGitHubAuthConfig()
    const redirectUri = resolveRedirectUri(req)
    const origin = getRequestOrigin(req)
    const requestUrl = new URL(req.url || '/api/auth/github/callback', origin)
    const code = requestUrl.searchParams.get('code')
    const state = requestUrl.searchParams.get('state')
    const storedState = readStateCookie(req, sessionSecret)

    if (!code || !state || !storedState || storedState.state !== state) {
      clearSessionCookies(res)
      return redirect(res, '/?tab=paperwork&auth_error=state')
    }

    const accessToken = await exchangeCodeForToken({
      code,
      clientId,
      clientSecret,
      redirectUri,
    })
    const identity = await fetchGitHubIdentity(accessToken)
    assertGitHubIdentityHasEmail(identity)
    assertGitHubUserAllowed(identity)

    clearSessionCookies(res)
    setSessionCookie(res, encodeURIComponent(createSessionCookieValue(identity, sessionSecret)))
    return redirect(res, storedState.returnTo || '/?tab=paperwork')
  } catch (error) {
    clearSessionCookies(res)
    const statusCode =
      typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 302
    if (statusCode === 403) {
      const reason =
        typeof error === 'object' && error !== null && 'reason' in error && typeof error.reason === 'string'
          ? error.reason
          : 'forbidden'
      return redirect(res, `/?tab=paperwork&auth_error=${encodeURIComponent(reason)}`)
    }

    return redirect(res, '/?tab=paperwork&auth_error=github')
  }
}
