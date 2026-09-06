import { getGitHubAuthConfig, readSession, sendJson } from './_shared.js'

export default function handler(req, res) {
  try {
    const { sessionSecret } = getGitHubAuthConfig()
    const session = readSession(req, sessionSecret)

    if (!session) {
      return sendJson(res, 200, { authenticated: false, user: null })
    }

    if (typeof session.email !== 'string' || session.email.trim().length === 0) {
      return sendJson(res, 200, {
        authenticated: false,
        user: null,
        message: 'This GitHub session does not expose an email address required for Paperwork.',
      })
    }

    return sendJson(res, 200, {
      authenticated: true,
      user: {
        login: session.login,
        name: session.name ?? null,
        avatarUrl: session.avatarUrl ?? null,
        email: session.email ?? null,
      },
    })
  } catch (error) {
    return sendJson(res, 500, {
      authenticated: false,
      user: null,
      message: error instanceof Error ? error.message : 'Could not resolve Paperwork session.',
    })
  }
}
