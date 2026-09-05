import { useQuery } from '@tanstack/react-query'
import { fetchPaperworkSession } from './client'

export function usePaperworkAuth(enabled: boolean) {
  return useQuery({
    queryKey: ['paperwork', 'auth-session'],
    queryFn: fetchPaperworkSession,
    enabled,
    staleTime: 60_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
  })
}
