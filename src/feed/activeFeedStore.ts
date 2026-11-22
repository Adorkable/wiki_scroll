import { createMergedCursor } from '../wiki/mergedCursor.ts'
import { getSource } from '../wiki/sources.ts'
import type { FeedCursor } from '../wiki/types.ts'
import { createFeedStore } from './feedStore.ts'
import { createHydrator } from './hydration.ts'
import { followStore } from './followStore.ts'
import { preferencesStore } from './preferencesStore.ts'
import { requireImage } from './policy.ts'

/**
 * Builds a cursor over everything currently followed. Called afresh each time
 * the store needs a cursor, so it always reflects the current selection.
 */
function openFollowedCursor(): FeedCursor {
  return createMergedCursor(
    followStore.followedSiteIds().map((siteId) => ({
      siteId,
      open: () => getSource(siteId).openFeed({ sort: 'recently-updated', pageSize: 10 }),
    })),
    {
      onSourceError: (siteId, error) => feedStore.noteSourceError(siteId, error),
      onSourceRecovered: (siteId) => feedStore.noteSourceRecovered(siteId),
    },
  )
}

/**
 * The app's one feed store. Being a module singleton is what makes the
 * in-memory cache work: navigating to an article and back re-mounts FeedRoute
 * against the same already-populated store, with no refetch.
 */
export const feedStore = createFeedStore({
  openCursor: openFollowedCursor,
  hydrateItems: createHydrator(getSource),
  shouldHydrate: preferencesStore.loadSummaries,
  policy: requireImage,
})

// Changing which wikis are followed invalidates everything already loaded.
followStore.onChange(() => feedStore.reset())

// Reload so already-loaded cards match the new setting (gain or drop summaries).
preferencesStore.onChange(() => feedStore.reset())
