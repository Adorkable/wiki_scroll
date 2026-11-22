import { describe, expect, it } from 'vitest'
import { createFeedStore } from './feedStore.ts'
import { acceptAll, requireImage } from './policy.ts'
import type { FeedPolicy } from './policy.ts'
import type { FeedCursor, FeedItem } from '../wiki/types.ts'

function item(pageId: number, withImage = true): FeedItem {
  return {
    id: `fake:${pageId}`,
    pageId,
    title: `Article ${pageId}`,
    updatedAt: new Date('2026-09-17T10:00:00Z'),
    summary: 'A summary.',
    image: withImage ? { url: 'https://example.org/a.jpg', width: 800, height: 600 } : undefined,
  }
}

/** A cursor factory yielding the given batches in order, then null. */
function fakeCursors(batches: FeedItem[][]): {
  open: () => FeedCursor
  batchesRequested: () => number
} {
  let requested = 0
  const cursor: FeedCursor = {
    async next() {
      if (requested >= batches.length) return null
      return batches[requested++]!
    },
  }
  return { open: () => cursor, batchesRequested: () => requested }
}

function failingCursor(): () => FeedCursor {
  return () => ({
    async next(): Promise<FeedItem[] | null> {
      throw new Error('network down')
    },
  })
}

/** No-op hydration, for the tests that are not about hydration. */
const noHydrate = async (): Promise<Map<string, string>> => new Map()

/**
 * Positional wrapper over the options object, so these tests stay readable.
 * Tests about hydration pass their own hydrateItems.
 */
function makeStore(
  openCursor: () => FeedCursor,
  policy: FeedPolicy,
  hydrateItems: (items: FeedItem[]) => Promise<Map<string, string>> = noHydrate,
) {
  return createFeedStore({ openCursor, hydrateItems, policy })
}

describe('createFeedStore', () => {
  it('starts empty and idle', () => {
    const store = makeStore(fakeCursors([]).open, acceptAll)
    expect(store.items()).toEqual([])
    expect(store.status()).toBe('idle')
  })

  it('appends accepted items on loadMore', async () => {
    const store = makeStore(fakeCursors([[item(1), item(2)]]).open, acceptAll)
    await store.loadMore()
    expect(store.items().map((i) => i.pageId)).toEqual([1, 2])
  })

  it('filters items rejected by the policy', async () => {
    const batch = [item(1, true), item(2, false), item(3, true)]
    const store = makeStore(fakeCursors([batch]).open, requireImage)
    await store.loadMore()
    expect(store.items().map((i) => i.pageId)).toEqual([1, 3])
  })

  it('deduplicates items already in the feed', async () => {
    const store = makeStore(
      fakeCursors([
        [item(1), item(2)],
        [item(2), item(3)],
      ]).open,
      acceptAll,
    )
    await store.loadMore()
    await store.loadMore()
    expect(store.items().map((i) => i.pageId)).toEqual([1, 2, 3])
  })

  it('deduplicates within a single batch', async () => {
    const store = makeStore(fakeCursors([[item(1), item(1)]]).open, acceptAll)
    await store.loadMore()
    expect(store.items().map((i) => i.pageId)).toEqual([1])
  })

  it('keeps pulling batches until the target is met', async () => {
    // Four batches of 3 accepted items; target is 10, so it needs four batches.
    const cursors = fakeCursors([
      [item(1), item(2), item(3)],
      [item(4), item(5), item(6)],
      [item(7), item(8), item(9)],
      [item(10), item(11), item(12)],
    ])
    const store = makeStore(cursors.open, acceptAll)
    await store.loadMore()
    expect(store.items().length).toBeGreaterThanOrEqual(10)
    expect(cursors.batchesRequested()).toBe(4)
  })

  it('stops at the batch cap even when the target is unmet', async () => {
    // Ten batches of one rejected item each. Target can never be met.
    const cursors = fakeCursors(Array.from({ length: 10 }, (_, n) => [item(n + 1, false)]))
    const store = makeStore(cursors.open, requireImage)
    await store.loadMore()
    expect(cursors.batchesRequested()).toBe(5)
    expect(store.items()).toEqual([])
    expect(store.status()).toBe('idle')
  })

  it('becomes exhausted when the cursor runs dry', async () => {
    const store = makeStore(fakeCursors([[item(1)]]).open, acceptAll)
    await store.loadMore()
    expect(store.status()).toBe('exhausted')
  })

  it('does nothing further once exhausted', async () => {
    const cursors = fakeCursors([[item(1)]])
    const store = makeStore(cursors.open, acceptAll)
    await store.loadMore()
    const batchesAfterFirst = cursors.batchesRequested()
    await store.loadMore()
    expect(cursors.batchesRequested()).toBe(batchesAfterFirst)
  })

  it('enters error status when the cursor throws', async () => {
    const store = makeStore(failingCursor(), acceptAll)
    await store.loadMore()
    expect(store.status()).toBe('error')
    expect(store.error()?.message).toBe('network down')
  })

  it('keeps already-loaded items when a later load fails', async () => {
    let calls = 0
    const open = (): FeedCursor => ({
      async next(): Promise<FeedItem[] | null> {
        calls++
        if (calls === 1) return [item(1)]
        throw new Error('network down')
      },
    })
    const store = makeStore(open, acceptAll)
    await store.loadMore()
    await store.loadMore()
    expect(store.status()).toBe('error')
    expect(store.items().map((i) => i.pageId)).toEqual([1])
  })

  it('retry clears the error and loads again', async () => {
    let calls = 0
    const open = (): FeedCursor => ({
      async next(): Promise<FeedItem[] | null> {
        calls++
        if (calls === 1) throw new Error('network down')
        return [item(1)]
      },
    })
    const store = makeStore(open, acceptAll)
    await store.loadMore()
    expect(store.status()).toBe('error')
    await store.retry()
    expect(store.error()).toBeNull()
    expect(store.items().map((i) => i.pageId)).toEqual([1])
  })

  it('ignores a concurrent loadMore while one is in flight', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const open = (): FeedCursor => ({
      async next(): Promise<FeedItem[] | null> {
        calls++
        await gate
        return null
      },
    })
    const store = makeStore(open, acceptAll)
    const first = store.loadMore()
    const second = store.loadMore()
    release()
    await Promise.all([first, second])
    expect(calls).toBe(1)
  })

  it('remembers a scroll offset', () => {
    const store = makeStore(fakeCursors([]).open, acceptAll)
    store.setScrollOffset(420)
    expect(store.scrollOffset()).toBe(420)
  })

  /**
   * Regression: a real async generator is dead once it throws — every later
   * next() returns { done: true }. A cursor backed by one therefore reports
   * exhaustion forever, so reusing it after a failure turns a transient
   * network error into a permanent "end of feed". The store must discard a
   * cursor that errored and open a fresh one on retry.
   */
  it('opens a fresh cursor after a failure instead of reusing the dead one', async () => {
    let cursorsOpened = 0
    const open = (): FeedCursor => {
      cursorsOpened++
      const failsImmediately = cursorsOpened === 1
      let dead = false
      return {
        async next(): Promise<FeedItem[] | null> {
          // Generator semantics: once it has thrown, it is done forever.
          if (dead) return null
          if (failsImmediately) {
            dead = true
            throw new Error('network down')
          }
          dead = true
          return [item(1)]
        },
      }
    }

    const store = makeStore(open, acceptAll)
    await store.loadMore()
    expect(store.status()).toBe('error')

    await store.retry()
    expect(store.items().map((i) => i.pageId)).toEqual([1])
    expect(cursorsOpened).toBe(2)
  })
})

describe('feedStore reset', () => {
  it('clears items', async () => {
    const store = makeStore(fakeCursors([[item(1), item(2)]]).open, acceptAll)
    await store.loadMore()
    store.reset()
    expect(store.items()).toEqual([])
  })

  it('returns to idle from exhausted', async () => {
    const store = makeStore(fakeCursors([[item(1)]]).open, acceptAll)
    await store.loadMore()
    expect(store.status()).toBe('exhausted')
    store.reset()
    expect(store.status()).toBe('idle')
  })

  it('clears the scroll offset', () => {
    const store = makeStore(fakeCursors([]).open, acceptAll)
    store.setScrollOffset(500)
    store.reset()
    expect(store.scrollOffset()).toBe(0)
  })

  it('clears the dedupe set, so the same items can load again', async () => {
    // Each call gets a fresh cursor yielding the same item. Without clearing
    // seenIds, the second load would dedupe it away and leave an empty feed.
    const open = (): FeedCursor => {
      let done = false
      return {
        async next() {
          if (done) return null
          done = true
          return [item(1)]
        },
      }
    }
    const store = makeStore(open, acceptAll)
    await store.loadMore()
    store.reset()
    await store.loadMore()
    expect(store.items().map((i) => i.pageId)).toEqual([1])
  })

  it('opens a fresh cursor after reset', async () => {
    let opened = 0
    const open = (): FeedCursor => {
      opened++
      let done = false
      return {
        async next() {
          if (done) return null
          done = true
          return [item(opened)]
        },
      }
    }
    const store = makeStore(open, acceptAll)
    await store.loadMore()
    store.reset()
    await store.loadMore()
    expect(opened).toBe(2)
  })

  it('clears source errors', async () => {
    const store = makeStore(failingCursor(), acceptAll)
    await store.loadMore()
    store.reset()
    expect(store.sourceErrors()).toEqual([])
    expect(store.error()).toBeNull()
  })
})

describe('feedStore sourceErrors', () => {
  it('starts empty', () => {
    expect(makeStore(fakeCursors([]).open, acceptAll).sourceErrors()).toEqual([])
  })

  it('records a reported source error', () => {
    const store = makeStore(fakeCursors([]).open, acceptAll)
    store.noteSourceError('wikipedia:ja', new Error('down'))
    expect(store.sourceErrors().map((e) => e.siteId)).toEqual(['wikipedia:ja'])
  })

  it('does not duplicate a repeated error for the same site', () => {
    const store = makeStore(fakeCursors([]).open, acceptAll)
    store.noteSourceError('wikipedia:ja', new Error('down'))
    store.noteSourceError('wikipedia:ja', new Error('still down'))
    expect(store.sourceErrors()).toHaveLength(1)
  })

  it('clears a site on recovery', () => {
    const store = makeStore(fakeCursors([]).open, acceptAll)
    store.noteSourceError('wikipedia:ja', new Error('down'))
    store.noteSourceError('wikipedia:de', new Error('down'))
    store.noteSourceRecovered('wikipedia:ja')
    expect(store.sourceErrors().map((e) => e.siteId)).toEqual(['wikipedia:de'])
  })
})

describe('reset during an in-flight load', () => {
  /**
   * Regression: loadMore commits whatever it accepted with no check that the
   * store is still the same feed it started loading. A selection change
   * mid-flight would append articles from the *previous* selection to the
   * freshly reset feed.
   */
  it('discards items fetched before the reset', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const open = (): FeedCursor => ({
      async next() {
        await gate
        return [item(1)]
      },
    })

    const store = makeStore(open, acceptAll)
    const loading = store.loadMore()
    store.reset()
    release()
    await loading

    expect(store.items()).toEqual([])
  })

  it('does not set a status from a superseded load', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const open = (): FeedCursor => ({
      async next() {
        await gate
        return null
      },
    })

    const store = makeStore(open, acceptAll)
    const loading = store.loadMore()
    store.reset()
    release()
    await loading

    // The superseded load reached exhaustion; the reset feed has not.
    expect(store.status()).toBe('idle')
  })

  it('does not set an error from a superseded load', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const open = (): FeedCursor => ({
      async next(): Promise<FeedItem[] | null> {
        await gate
        throw new Error('network down')
      },
    })

    const store = makeStore(open, acceptAll)
    const loading = store.loadMore()
    store.reset()
    release()
    await loading

    expect(store.status()).toBe('idle')
    expect(store.error()).toBeNull()
  })
})

describe('hydration', () => {
  /** Resolves when released, so the test controls when summaries arrive. */
  function gatedHydrator(summaries: Record<string, string>) {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const hydrate = async (items: FeedItem[]): Promise<Map<string, string>> => {
      await gate
      return new Map(items.map((i) => [i.id, summaries[i.id] ?? '']))
    }
    return { hydrate, release: () => release() }
  }

  /** Items arrive with no summary, as phase 1 leaves them. */
  function bare(pageId: number, withImage = true): FeedItem {
    const base = item(pageId, withImage)
    return { ...base, summary: undefined }
  }

  it('renders items before their summaries arrive', async () => {
    const { hydrate } = gatedHydrator({})
    const store = makeStore(fakeCursors([[bare(1)]]).open, acceptAll, hydrate)

    await store.loadMore()

    // The whole point: cards are on screen with summary still undefined.
    expect(store.items()).toHaveLength(1)
    expect(store.items()[0]!.summary).toBeUndefined()
  })

  it('does not wait for hydration before leaving the loading state', async () => {
    const { hydrate } = gatedHydrator({})
    const store = makeStore(fakeCursors([[bare(1), bare(2)]]).open, acceptAll, hydrate)

    await store.loadMore()

    // Still loading would block the sentinel from requesting the next batch.
    expect(store.status()).not.toBe('loading')
  })

  it('patches summaries in when hydration resolves', async () => {
    const { hydrate, release } = gatedHydrator({ 'fake:1': 'An article about things.' })
    const store = makeStore(fakeCursors([[bare(1)]]).open, acceptAll, hydrate)

    await store.loadMore()
    release()
    await Promise.resolve()
    await Promise.resolve()

    expect(store.items()[0]!.summary).toBe('An article about things.')
  })

  it("settles an item the hydrator omitted at '' rather than leaving it shimmering", async () => {
    const hydrate = async (): Promise<Map<string, string>> => new Map()
    const store = makeStore(fakeCursors([[bare(1)]]).open, acceptAll, hydrate)

    await store.loadMore()
    await Promise.resolve()
    await Promise.resolve()

    expect(store.items()[0]!.summary).toBe('')
  })

  it('settles summaries when hydration rejects, without erroring the feed', async () => {
    const hydrate = async (): Promise<Map<string, string>> => {
      throw new Error('extracts unavailable')
    }
    const store = makeStore(fakeCursors([[bare(1)]]).open, acceptAll, hydrate)

    await store.loadMore()
    await Promise.resolve()
    await Promise.resolve()

    expect(store.items()[0]!.summary).toBe('')
    // The articles loaded fine; only their descriptions did not.
    expect(store.status()).not.toBe('error')
    expect(store.error()).toBeNull()
  })

  it('discards hydration belonging to a superseded generation', async () => {
    /*
     * The reload after reset yields the SAME item id on purpose. Asserting
     * only that the feed is empty after reset would pass with or without the
     * generation guard, because mapping a stale summary over an empty list is
     * a no-op — a vacuous test. Reloading the same id gives the stale summary
     * something to land on if the guard is missing.
     */
    let hydrations = 0
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const hydrate = async (items: FeedItem[]): Promise<Map<string, string>> => {
      hydrations++
      if (hydrations === 1) {
        await firstGate
        return new Map(items.map((i) => [i.id, 'Stale summary.']))
      }
      return new Map(items.map((i) => [i.id, 'Fresh summary.']))
    }

    let opened = 0
    const open = (): FeedCursor => {
      opened++
      let done = false
      return {
        async next() {
          if (done) return null
          done = true
          return [bare(1)]
        },
      }
    }

    const store = makeStore(open, acceptAll, hydrate)

    await store.loadMore()
    store.reset()
    await store.loadMore()
    await Promise.resolve()
    await Promise.resolve()

    releaseFirst()
    await Promise.resolve()
    await Promise.resolve()

    expect(opened).toBe(2)
    expect(store.items()).toHaveLength(1)
    expect(store.items()[0]!.summary).toBe('Fresh summary.')
  })

  it('does not hydrate when nothing was accepted', async () => {
    let called = false
    const hydrate = async (): Promise<Map<string, string>> => {
      called = true
      return new Map()
    }
    const store = makeStore(fakeCursors([[bare(1, false)]]).open, requireImage, hydrate)

    await store.loadMore()

    expect(called).toBe(false)
  })
})

describe('createFeedStore with hydration disabled', () => {
  it('settles summaries to empty and never calls the hydrator', async () => {
    let hydrateCalls = 0
    const store = createFeedStore({
      openCursor: fakeCursors([[{ ...item(1), summary: undefined }]]).open,
      hydrateItems: async () => {
        hydrateCalls++
        return new Map()
      },
      shouldHydrate: () => false,
      policy: acceptAll,
    })

    await store.loadMore()
    await Promise.resolve()

    expect(store.items().map((entry) => entry.summary)).toEqual([''])
    expect(hydrateCalls).toBe(0)
  })
})
