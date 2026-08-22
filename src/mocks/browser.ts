import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

const worker = setupWorker(...handlers)

export async function startMocking() {
  await worker.start({
    onUnhandledRequest: 'bypass',
  })
}
