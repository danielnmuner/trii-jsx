import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

export function renderWithProviders(element: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{element}</BrowserRouter>
      </QueryClientProvider>,
    ),
  }
}
