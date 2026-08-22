import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { isRetryableHttpError } from '../../shared/api/http'

type AppProvidersProps = {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 300_000,
            retry: (failureCount, error) => failureCount < 3 && isRetryableHttpError(error),
            retryDelay: (attemptIndex) => Math.min(1_000 * 2 ** attemptIndex, 15_000),
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  )
}
