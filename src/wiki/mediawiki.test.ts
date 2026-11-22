import { describe, expect, it } from 'vitest'
import {
  MediaWikiSource,
  MediaWikiFeedCursor,
  SESSION_DEFAULT_PARAMS,
  mapPagesToItems,
  parseResponseToArticle,
} from './mediawiki.ts'
import type { MediaWikiSourceConfig, RecentChangesResponse } from './mediawiki.ts'
import { recentChangesBatch } from './fixtures/recentchanges.ts'

const pages = recentChangesBatch.query!.pages!

describe('mapPagesToItems', () => {
  it('maps every page to a FeedItem', () => {
    expect(mapPagesToItems('wikipedia-en', pages)).toHaveLength(4)
  })

  it('builds a source-qualified id', () => {
    const items = mapPagesToItems('wikipedia-en', pages)
    expect(items.map((i) => i.id)).toContain('wikipedia-en:1')
  })

  it('sorts the batch by updatedAt descending', () => {
    const items = mapPagesToItems('wikipedia-en', pages)
    expect(items.map((i) => i.title)).toEqual([
      'List of Toyota engines', // 10:53:55
      'Commonwealth Law Reports', // 10:53:51
      'Apple II (original)', // 10:53:50
      'Alec Smir', // 10:53:49
    ])
  })

  it('maps a thumbnail to an image', () => {
    const item = mapPagesToItems('wikipedia-en', pages).find((i) => i.pageId === 1)!
    expect(item.image).toEqual({
      url: 'https://upload.wikimedia.org/a.jpg',
      width: 800,
      height: 709,
    })
  })

  it('leaves image undefined when the page has no thumbnail', () => {
    const item = mapPagesToItems('wikipedia-en', pages).find((i) => i.pageId === 2)!
    expect(item.image).toBeUndefined()
  })

  it('leaves summary undefined when the page has no extract', () => {
    // Phase 1 never requests extracts, so this is the normal case now. It must
    // be undefined rather than '' so the card knows to shimmer.
    const item = mapPagesToItems('wikipedia-en', pages).find((i) => i.pageId === 4)!
    expect(item.summary).toBeUndefined()
  })

  it('still carries an extract through when one is present', () => {
    const item = mapPagesToItems('wikipedia-en', pages).find((i) => i.pageId === 1)!
    expect(item.summary).toBe('The Apple II is an 8-bit home computer.')
  })

  it('parses the revision timestamp into a Date', () => {
    const item = mapPagesToItems('wikipedia-en', pages).find((i) => i.pageId === 1)!
    expect(item.updatedAt.toISOString()).toBe('2026-09-17T10:53:50.000Z')
  })
})

/** Builds an async iterator over canned responses, standing in for m3api. */
async function* fakeResponses(
  ...responses: RecentChangesResponse[]
): AsyncGenerator<RecentChangesResponse> {
  for (const response of responses) yield response
}

describe('MediaWikiFeedCursor', () => {
  it('returns a mapped batch on next()', async () => {
    const cursor = new MediaWikiFeedCursor('wikipedia-en', fakeResponses(recentChangesBatch))
    const batch = await cursor.next()
    expect(batch).toHaveLength(4)
  })

  it('returns null once the iterator is exhausted', async () => {
    const cursor = new MediaWikiFeedCursor('wikipedia-en', fakeResponses(recentChangesBatch))
    await cursor.next()
    expect(await cursor.next()).toBeNull()
  })

  it('keeps returning null after exhaustion', async () => {
    const cursor = new MediaWikiFeedCursor('wikipedia-en', fakeResponses())
    expect(await cursor.next()).toBeNull()
    expect(await cursor.next()).toBeNull()
  })

  it('returns an empty batch rather than null when a response has no pages', async () => {
    const cursor = new MediaWikiFeedCursor('wikipedia-en', fakeResponses({ query: {} }))
    expect(await cursor.next()).toEqual([])
  })
})

const testConfig: MediaWikiSourceConfig = {
  id: 'wikipedia:en',
  displayName: 'Wikipedia (English)',
  domain: 'en.wikipedia.org',
  apiPath: '/w/api.php',
  userAgent: 'wiki-scroll/0.1',
}

describe('parseResponseToArticle', () => {
  const updatedAt = new Date('2026-09-17T10:53:50Z')

  it('extracts the title', () => {
    const article = parseResponseToArticle(
      testConfig,
      { parse: { title: 'Apple II', text: '<p>Hi</p>' } },
      updatedAt,
    )
    expect(article.title).toBe('Apple II')
  })

  it('sanitises the html', () => {
    const article = parseResponseToArticle(
      testConfig,
      { parse: { title: 'Apple II', text: '<p>Hi</p><script>alert(1)</script>' } },
      updatedAt,
    )
    expect(article.html).toContain('Hi')
    expect(article.html).not.toContain('script')
  })

  it('builds a canonical url from the config domain and title', () => {
    const article = parseResponseToArticle(
      testConfig,
      { parse: { title: 'Apple II (original)', text: '<p>Hi</p>' } },
      updatedAt,
    )
    expect(article.canonicalUrl).toBe('https://en.wikipedia.org/wiki/Apple%20II%20(original)')
  })

  it('carries the updatedAt through', () => {
    const article = parseResponseToArticle(
      testConfig,
      { parse: { title: 'Apple II', text: '<p>Hi</p>' } },
      updatedAt,
    )
    expect(article.updatedAt).toBe(updatedAt)
  })

  it('throws a descriptive error when the response has no parse block', () => {
    expect(() => parseResponseToArticle(testConfig, {}, updatedAt)).toThrow(/no parse/i)
  })
})

describe('SESSION_DEFAULT_PARAMS', () => {
  /**
   * Regression: m3api's README requires `origin: '*'` for anonymous
   * cross-site requests from a browser. Without it every request fails CORS
   * in the WebView — but passes under Node, which does not enforce CORS.
   */
  it("sends origin '*' so anonymous browser requests pass CORS", () => {
    expect(SESSION_DEFAULT_PARAMS.origin).toBe('*')
  })

  it('uses formatversion 2, which the response mapping assumes', () => {
    expect(SESSION_DEFAULT_PARAMS.formatversion).toBe(2)
  })
})

describe('MediaWikiSource request construction', () => {
  /**
   * Intercepts fetch to assert on the URL actually sent. Asserting the
   * constant alone would not catch the session being built with different
   * parameters, which is how the original CORS bug reached the browser.
   */
  async function captureFeedRequestUrl(): Promise<string> {
    const originalFetch = globalThis.fetch
    let captured = ''

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      captured = typeof input === 'string' ? input : input.toString()
      return new Response(JSON.stringify({ batchcomplete: true, query: { pages: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof globalThis.fetch

    try {
      const source = new MediaWikiSource(testConfig)
      await source.openFeed({ sort: 'recently-updated', pageSize: 10 }).next()
    } finally {
      globalThis.fetch = originalFetch
    }

    return captured
  }

  it('includes origin=* in the request URL', async () => {
    const url = await captureFeedRequestUrl()
    expect(decodeURIComponent(url)).toContain('origin=*')
  })

  it('requests the recentchanges generator', async () => {
    const url = await captureFeedRequestUrl()
    expect(url).toContain('generator=recentchanges')
  })

  it('does not request extracts, which cost 2-5x the response time', async () => {
    const url = await captureFeedRequestUrl()
    expect(decodeURIComponent(url)).not.toContain('extracts')
    expect(decodeURIComponent(url)).not.toContain('exintro')
  })

  it('still requests thumbnails, which the image policy needs', async () => {
    const url = await captureFeedRequestUrl()
    expect(decodeURIComponent(url)).toContain('pageimages')
  })
})

describe('canonicalUrl article path', () => {
  // Wikis differ: Wikipedia serves /wiki/, Minecraft Wiki /w/. Hardcoding
  // /wiki/ happens to survive on minecraft.wiki because it 301-redirects,
  // but that is luck rather than correctness.
  const mcConfig: MediaWikiSourceConfig = {
    id: 'custom-abcd1234',
    displayName: 'Minecraft Wiki',
    domain: 'minecraft.wiki',
    apiPath: '/api.php',
    articlePath: '/w/',
    userAgent: 'wiki-scroll/0.1',
  }

  it("uses the wiki's own article path", () => {
    const article = parseResponseToArticle(
      mcConfig,
      { parse: { title: 'Anvil', text: '<p>Hi</p>' } },
      new Date(),
    )
    expect(article.canonicalUrl).toBe('https://minecraft.wiki/w/Anvil')
  })

  it('still uses /wiki/ for Wikipedia', () => {
    const article = parseResponseToArticle(
      { ...testConfig, articlePath: '/wiki/' },
      { parse: { title: 'Apple II', text: '<p>Hi</p>' } },
      new Date(),
    )
    expect(article.canonicalUrl).toBe('https://en.wikipedia.org/wiki/Apple%20II')
  })
})

import { parseDetailsResponse } from './mediawiki.ts'
import type { DetailsResponse } from './mediawiki.ts'

describe('parseDetailsResponse', () => {
  const detailsResponse: DetailsResponse = {
    query: {
      pages: [
        { pageid: 1, extract: 'The Apple II is an 8-bit home computer.' },
        { pageid: 2, extract: 'A list of engines.' },
      ],
    },
  }

  it('maps page ids to summaries', () => {
    const summaries = parseDetailsResponse(detailsResponse, [1, 2])
    expect(summaries.get(1)).toBe('The Apple II is an 8-bit home computer.')
    expect(summaries.get(2)).toBe('A list of engines.')
  })

  it("settles a page the API returned without an extract at ''", () => {
    const summaries = parseDetailsResponse({ query: { pages: [{ pageid: 3 }] } }, [3])
    expect(summaries.get(3)).toBe('')
  })

  it("settles a requested page the API omitted entirely at ''", () => {
    // Without this the item keeps summary === undefined and shimmers forever.
    const summaries = parseDetailsResponse(detailsResponse, [1, 2, 99])
    expect(summaries.get(99)).toBe('')
  })

  it('covers every requested id', () => {
    const summaries = parseDetailsResponse({}, [7, 8, 9])
    expect([...summaries.keys()].sort()).toEqual([7, 8, 9])
    expect([...summaries.values()]).toEqual(['', '', ''])
  })

  it('returns an empty map for no requested ids', () => {
    expect(parseDetailsResponse(detailsResponse, []).size).toBe(0)
  })
})

describe('MediaWikiSource.fetchDetails', () => {
  async function captureDetailsRequest(pageIds: number[]): Promise<{
    url: string
    summaries: Map<number, string>
  }> {
    const originalFetch = globalThis.fetch
    let captured = ''

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      captured = typeof input === 'string' ? input : input.toString()
      return new Response(
        JSON.stringify({ query: { pages: [{ pageid: 1, extract: 'Hello.' }] } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof globalThis.fetch

    try {
      const summaries = await new MediaWikiSource(testConfig).fetchDetails(pageIds)
      return { url: captured, summaries }
    } finally {
      globalThis.fetch = originalFetch
    }
  }

  it('requests extracts for the given page ids', async () => {
    const { url } = await captureDetailsRequest([1, 2])
    const decoded = decodeURIComponent(url)
    expect(decoded).toContain('extracts')
    expect(decoded).toContain('pageids')
  })

  it('sends exlimit=max, since TextExtracts caps multi-page extracts', async () => {
    const { url } = await captureDetailsRequest([1, 2])
    expect(decodeURIComponent(url)).toContain('exlimit=max')
  })

  it('returns the parsed summaries', async () => {
    const { summaries } = await captureDetailsRequest([1])
    expect(summaries.get(1)).toBe('Hello.')
  })

  it('makes no request at all for an empty id list', async () => {
    const originalFetch = globalThis.fetch
    let called = false
    globalThis.fetch = (async () => {
      called = true
      return new Response('{}', { status: 200 })
    }) as typeof globalThis.fetch

    try {
      const summaries = await new MediaWikiSource(testConfig).fetchDetails([])
      expect(called).toBe(false)
      expect(summaries.size).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
