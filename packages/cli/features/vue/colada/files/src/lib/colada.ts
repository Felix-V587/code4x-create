/**
 * Global Pinia Colada defaults (installed in `src/main.ts`).
 *
 * Keep app-wide caching policy here so individual `useQuery` calls only declare
 * what is specific to them.
 */
export const coladaOptions = {
  queryOptions: {
    staleTime: 30_000,
  },
}
