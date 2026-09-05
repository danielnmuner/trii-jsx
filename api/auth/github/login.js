import {
  buildAuthorizeUrl,
  createStateCookieValue,
  getGitHubAuthConfig,
  getRequestOrigin,
  resolveRedirectUri,
  redirect,
  sanitizeReturnTo,
  setStateCookie,
} from '../_shared.js'

export default function handler(req, res) {
  try {
    const { clientId, sessionSecret } = getGitHubAuthConfig()
    const redirectUri = resolveRedirectUri(req)
    const origin = getRequestOrigin(req)
    const requestUrl = new URL(req.url || '/api/auth/github/login', origin)
    const returnTo = sanitizeReturnTo(requestUrl.searchParams.get('return_to'))
    const prompt = requestUrl.searchParams.get('prompt') === 'select_account' ? 'select_account' : undefined
    const signedState = createStateCookieValue(returnTo, sessionSecret)
    const [statePayload] = signedState.split('.')
    setStateCookie(res, encodeURIComponent(signedState))
    redirect(
      res,
      buildAuthorizeUrl({
        clientId,
        redirectUri,
        state: statePayload ? JSON.parse(Buffer.from(statePayload, 'base64url').toString('utf8')).state : '',
        prompt,
      }),
    )
  } catch (error) {
    res.statusCode = 500
    res.end(error instanceof Error ? error.message : 'GitHub login setup failed.')
  }
}
