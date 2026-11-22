import { describe, expect, it } from 'vitest'
import { createHydrator, groupItemsBySite } from './hydration.ts'
import type { DetailFetcher } from './hydration.ts'
import type { FeedItem } from '../wiki/types.ts'

function item(siteId: string, pageId: number): FeedItem {
  return {
    id: `${siteId}:${pageId}`,
    pageId,
    title: `Article ${pageId}`,
    updatedAt: new Date('2026-09-18T10:00:00Z'),
    image: { url: 'https://example.org/a.jpg', width: 8, height: 6 },
  }
}

describe('groupItemsBySite', () => {
  it('groups by everything before the last colon', () => {
    // Ids look like wikipedia:en:12345 — the site id itself contains a colon.
    const grouped = groupItemsBySite([item('wikipedia:en', 1), item('wikipedia:ja', 2)])
    expect([...grouped.keys()].sort()).toEqual(['wikipedia:en', 'wikipedia:ja'])
  })

  it('puts items from one site together', () => {
    const grouped = groupItemsBySite([
      item('wikipedia:en', 1),
      item('wikipedia:en', 2),
      item('wiktionary:fr', 3),
    ])
    expect(grouped.get('wikipedia:en')!.map((i) => i.pageId)).toEqual([1, 2])
    expect(grouped.get('wiktionary:fr')!.map((i) => i.pageId)).toEqual([3])
  })

  it('returns an empty map for no items', () => {
    expect(groupItemsBySite([]).size).toBe(0)
  })
})

describe('createHydrator', () => {
  function fetcher(summaries: Record<number, string>, onCall?: (ids: number[]) => void) {
    return {
      async fetchDetails(pageIds: number[]) {
        onCall?.(pageIds)
        return new Map(pageIds.map((id) => [id, summaries[id] ?? '']))
      },
    }
  }

  it('returns summaries keyed by feed item id', async () => {
    const hydrate = createHydrator(() => fetcher({ 1: 'About one.' }))
    const summaries = await hydrate([item('wikipedia:en', 1)])
    expect(summaries.get('wikipedia:en:1')).toBe('About one.')
  })

  it('asks each site only for its own page ids', async () => {
    const calls: Record<string, number[]> = {}
    const hydrate = createHydrator((siteId) =>
      fetcher({ 1: 'a', 2: 'b', 3: 'c' }, (ids) => {
        calls[siteId] = ids
      }),
    )

    await hydrate([item('wikipedia:en', 1), item('wikipedia:en', 2), item('wiktionary:fr', 3)])

    expect(calls['wikipedia:en']).toEqual([1, 2])
    expect(calls['wiktionary:fr']).toEqual([3])
  })

  it('keeps other sites when one fails', async () => {
    const hydrate = createHydrator((siteId): DetailFetcher => {
      if (siteId === 'broken:en') {
        return {
          async fetchDetails() {
            throw new Error('down')
          },
        }
      }
      return fetcher({ 1: 'Fine.' })
    })

    const summaries = await hydrate([item('wikipedia:en', 1), item('broken:en', 9)])

    expect(summaries.get('wikipedia:en:1')).toBe('Fine.')
    // The failed site settles rather than shimmering forever.
    expect(summaries.get('broken:en:9')).toBe('')
  })

  it('settles every item when resolving a source throws', async () => {
    const hydrate = createHydrator(() => {
      throw new Error('unknown site')
    })
    const summaries = await hydrate([item('gone:en', 1)])
    expect(summaries.get('gone:en:1')).toBe('')
  })

  it('returns an empty map for no items', async () => {
    const hydrate = createHydrator(() => fetcher({}))
    expect((await hydrate([])).size).toBe(0)
  })
})
