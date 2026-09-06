import { useQuery } from '@tanstack/react-query'
import { fetchPaperworkSession } from './client'

export function usePaperworkAuth(enabled: boolean) {
  return useQuery({
    queryKey: ['paperwork', 'auth-session'],
    queryFn: fetchPaperworkSession,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
