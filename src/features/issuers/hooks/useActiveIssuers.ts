import { useQuery } from '@tanstack/react-query'
import { fetchActiveIssuers } from '../api/client'

// The issuers list changes rarely; refresh it every 15 minutes.
export const ISSUERS_REFRESH_MS = 15 * 60_000

export const activeIssuersQueryKey = ['issuers', 'active'] as const

export function useActiveIssuers() {
  return useQuery({
    queryKey: activeIssuersQueryKey,
    queryFn: fetchActiveIssuers,
    refetchInterval: ISSUERS_REFRESH_MS,
    staleTime: ISSUERS_REFRESH_MS,
    gcTime: Number.POSITIVE_INFINITY,
  })
}
