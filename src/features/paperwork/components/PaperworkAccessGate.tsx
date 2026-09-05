import type { ReactNode } from 'react'
import { buildPaperworkLoginUrl, buildPaperworkLogoutUrl } from '../auth/client'
import type { PaperworkAuthSession } from '../auth/schemas'

type PaperworkAccessGateProps = {
  session: PaperworkAuthSession | undefined
  isLoading: boolean
  errorMessage: string | null
  children: ReactNode
}

export function PaperworkAccessGate(props: PaperworkAccessGateProps) {
  const { session, isLoading, errorMessage, children } = props

  if (isLoading) {
    return (
      <section className="paperwork-auth">
        <article className="paperwork-authCard">
          <span className="paperwork-authCard__eyebrow">Paperwork Access</span>
          <h3 className="paperwork-authCard__title">Checking GitHub session</h3>
          <p className="paperwork-authCard__copy">Hold on while we validate access to the paperwork workspace.</p>
        </article>
      </section>
    )
  }

  if (!session?.authenticated || !session.user) {
    return (
      <section className="paperwork-auth">
        <article className="paperwork-authCard">
          <span className="paperwork-authCard__eyebrow">Paperwork Access</span>
          <h3 className="paperwork-authCard__title">Login with GitHub</h3>
          <p className="paperwork-authCard__copy">
            Paperwork stays behind a GitHub login on Vercel. Sign in with an allowed GitHub account to continue.
          </p>
          {errorMessage ? <div className="paperwork-authCard__notice">{errorMessage}</div> : null}
          <a className="paperwork-authCard__button" href={buildPaperworkLoginUrl()}>
            Continue with GitHub
          </a>
        </article>
      </section>
    )
  }

  return (
    <section className="paperwork-auth">
      <div className="paperwork-authBar">
        <div className="paperwork-authBar__identity">
          <span className="paperwork-authBar__eyebrow">GitHub Session</span>
          <strong>{session.user.name || session.user.login}</strong>
          <span>@{session.user.login}</span>
        </div>
        <a className="paperwork-authBar__logout" href={buildPaperworkLogoutUrl()}>
          Logout
        </a>
      </div>
      {children}
    </section>
  )
}
