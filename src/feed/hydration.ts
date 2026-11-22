import type { FeedItem } from '../wiki/types.ts'

/** The one thing hydration needs from a source; keeps this module testable. */
export interface DetailFetcher {
  fetchDetails(pageIds: number[]): Promise<Map<number, string>>
}

/**
 * Groups feed items by their site.
 *
 * FeedItem.id is `${familyId}:${lang}:${pageId}`, so the site id is everything
 * before the *last* colon — the site id itself contains one.
 */
export function groupItemsBySite(items: FeedItem[]): Map<string, FeedItem[]> {
  const bySite = new Map<string, FeedItem[]>()

  for (const item of items) {
    const siteId = item.id.slice(0, item.id.lastIndexOf(':'))
    const group = bySite.get(siteId)
    if (group) group.push(item)
    else bySite.set(siteId, [item])
  }

  return bySite
}

/**
 * Builds the phase 2 fetcher the feed store uses.
 *
 * Each site is queried separately and concurrently — they are independent
 * servers — and a site that fails settles its own items at '' without
 * affecting the others, matching the merged cursor's per-source isolation.
 */
export function createHydrator(
  resolveSource: (siteId: string) => DetailFetcher,
): (items: FeedItem[]) => Promise<Map<string, string>> {
  return async (items) => {
    const summaries = new Map<string, string>()

    await Promise.all(
      [...groupItemsBySite(items)].map(async ([siteId, group]) => {
        try {
          const details = await resolveSource(siteId).fetchDetails(group.map((i) => i.pageId))
          for (const item of group) summaries.set(item.id, details.get(item.pageId) ?? '')
        } catch {
          for (const item of group) summaries.set(item.id, '')
        }
      }),
    )

    return summaries
  }
}
