import { clearSessionCookies, redirect, sanitizeReturnTo } from './_shared.js'

export default function handler(req, res) {
  clearSessionCookies(res)
  const origin = getRequestOrigin(req)
  const requestUrl = new URL(req.url || '/api/auth/logout', origin)
  redirect(res, sanitizeReturnTo(requestUrl.searchParams.get('return_to')))
}

function getRequestOrigin(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${protocol}://${host}`
}
