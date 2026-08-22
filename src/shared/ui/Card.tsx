import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
}

export function Card({ children, className, ...props }: CardProps) {
  return (
    <section className={clsx('ui-card', className)} {...props}>
      {children}
    </section>
  )
}
