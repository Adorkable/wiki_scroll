import { createSignal } from 'solid-js'
import type { FeedCursor, FeedItem } from '../wiki/types.ts'
import type { FeedPolicy } from './policy.ts'

export type FeedStatus = 'idle' | 'loading' | 'exhausted' | 'error'

/** How many accepted items one loadMore() aims to add. */
export const TARGET_ITEMS_PER_LOAD = 10

/**
 * Hard cap on cursor batches consumed per loadMore(). Without this, a long run
 * of policy-rejected items (e.g. imageless articles) would spin indefinitely.
 */
export const MAX_BATCHES_PER_LOAD = 5

export interface FeedStore {
  items: () => FeedItem[]
  status: () => FeedStatus
  error: () => Error | null
  sourceErrors: () => Array<{ siteId: string; error: Error }>
  scrollOffset: () => number
  setScrollOffset: (offset: number) => void
  loadMore: () => Promise<void>
  retry: () => Promise<void>
  reset: () => void
  /** Fed by the cursor factory's onSourceError / onSourceRecovered hooks. */
  noteSourceError: (siteId: string, sourceError: Error) => void
  noteSourceRecovered: (siteId: string) => void
}

export interface FeedStoreOptions {
  openCursor: () => FeedCursor
  /** Phase 2: FeedItem.id to summary, for items already on screen. */
  hydrateItems: (items: FeedItem[]) => Promise<Map<string, string>>
  /**
   * Checked per load. When false, new items settle with an empty summary and
   * no hydration requests are made. Defaults to always hydrating.
   */
  shouldHydrate?: () => boolean
  policy: FeedPolicy
}

/**
 * The feed's accumulated items and pagination state. Deals only in cursors —
 * it has no knowledge of wikis, sources, or how many of them there are.
 */
export function createFeedStore(options: FeedStoreOptions): FeedStore {
  const { openCursor, hydrateItems, policy, shouldHydrate = () => true } = options
  const [items, setItems] = createSignal<FeedItem[]>([])
  const [status, setStatus] = createSignal<FeedStatus>('idle')
  const [error, setError] = createSignal<Error | null>(null)
  const [sourceErrors, setSourceErrors] = createSignal<Array<{ siteId: string; error: Error }>>([])
  const [scrollOffset, setScrollOffset] = createSignal(0)

  let seenIds = new Set<string>()
  let cursor: FeedCursor | null = null
  let inFlight = false

  /**
   * Incremented by reset(). Work started under an older generation is
   * discarded rather than applied, so a selection change never lets the
   * previous feed's articles or status leak into the new one.
   */
  let generation = 0

  function currentCursor(): FeedCursor {
    cursor ??= openCursor()
    return cursor
  }

  /**
   * Fills in summaries for items already on screen.
   *
   * Deliberately not awaited by loadMore: the cards are rendered and the feed
   * is idle before this starts, so the reader can scroll on and trigger the
   * next batch while these are still in flight.
   */
  async function hydrate(hydrating: FeedItem[], startedAt: number): Promise<void> {
    let summaries: Map<string, string>

    try {
      summaries = await hydrateItems(hydrating)
    } catch {
      // Losing descriptions is not losing the feed. Settle them so the cards
      // stop shimmering, and leave the feed's own status alone.
      summaries = new Map()
    }

    if (generation !== startedAt) return

    const requested = new Set(hydrating.map((entry) => entry.id))

    setItems((previous) =>
      previous.map((entry) =>
        // Anything requested settles, even if the hydrator skipped it —
        // otherwise that card shimmers forever.
        requested.has(entry.id) ? { ...entry, summary: summaries.get(entry.id) ?? '' } : entry,
      ),
    )
  }

  async function loadMore(): Promise<void> {
    if (inFlight) return
    if (status() === 'exhausted' || status() === 'error') return

    const startedAt = generation
    inFlight = true
    setStatus('loading')

    // Declared outside the try so that a failure partway through a multi-batch
    // load still commits the batches that did succeed. Without this, one bad
    // request discards up to four batches of good items.
    const accepted: FeedItem[] = []
    let failure: Error | null = null
    let exhausted = false

    try {
      let batches = 0

      while (accepted.length < TARGET_ITEMS_PER_LOAD && batches < MAX_BATCHES_PER_LOAD) {
        const batch = await currentCursor().next()
        batches++

        if (batch === null) {
          exhausted = true
          break
        }

        for (const candidate of batch) {
          if (seenIds.has(candidate.id)) continue
          if (!policy.accept(candidate)) continue
          seenIds.add(candidate.id)
          accepted.push(candidate)
        }
      }
    } catch (cause) {
      failure = cause instanceof Error ? cause : new Error(String(cause))
    } finally {
      inFlight = false
    }

    // A reset while this was in flight makes all of it stale. Everything below
    // is synchronous, so no other load can interleave here.
    if (generation !== startedAt) return

    // With hydration off, settle summaries now so the cards never shimmer.
    const hydrating = shouldHydrate()
    const committed = hydrating ? accepted : accepted.map((entry) => ({ ...entry, summary: '' }))

    if (committed.length > 0) {
      setItems((previous) => [...previous, ...committed])
    }

    if (failure) {
      // Discard the cursor. A cursor backed by an async generator is dead once
      // it throws — every later next() returns { done: true }, which reads as
      // exhaustion. Reusing it would turn a transient network error into a
      // permanent "end of feed"; the next load opens a fresh cursor instead.
      cursor = null
      setError(failure)
      setStatus('error')
      // A failed load still commits whatever it managed to accept, and those
      // cards are on screen — they need hydrating as much as a clean load's do.
      if (hydrating && accepted.length > 0) void hydrate(accepted, startedAt)
      return
    }

    setStatus(exhausted ? 'exhausted' : 'idle')

    if (hydrating && accepted.length > 0) void hydrate(accepted, startedAt)
  }

  async function retry(): Promise<void> {
    if (status() !== 'error') return
    setError(null)
    setStatus('idle')
    await loadMore()
  }

  /** Everything loaded is invalid — for instance when the followed set changes. */
  function reset(): void {
    generation++
    cursor = null
    seenIds = new Set<string>()
    setItems([])
    setStatus('idle')
    setError(null)
    setSourceErrors([])
    setScrollOffset(0)
  }

  function noteSourceError(siteId: string, sourceError: Error): void {
    setSourceErrors((previous) => [
      ...previous.filter((entry) => entry.siteId !== siteId),
      { siteId, error: sourceError },
    ])
  }

  function noteSourceRecovered(siteId: string): void {
    setSourceErrors((previous) => previous.filter((entry) => entry.siteId !== siteId))
  }

  return {
    items,
    status,
    error,
    sourceErrors,
    scrollOffset,
    setScrollOffset,
    loadMore,
    retry,
    reset,
    noteSourceError,
    noteSourceRecovered,
  }
}
