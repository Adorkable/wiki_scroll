# Wiki Scroll

An infinite, Instagram-style scroll of recently-updated wiki articles.

## Running

```bash
npm install
npm run dev      # dev server
npm test         # unit tests
npm run build    # production build
```

## Architecture

All wiki-specific knowledge lives behind the `WikiSource` interface in
`src/wiki/types.ts`. `src/wiki/mediawiki.ts` is the only file that imports
`m3api`; everything above it speaks in `FeedItem` and `ArticleContent`.

- **The wiki catalogue** is `src/wiki/catalogue.json` — *families* (Wikipedia,
  Wiktionary, …) each holding their language *sites*. Run
  `npm run update-catalogue` to refresh the Wikimedia families from the
  `sitematrix` API; families you add by hand are left untouched, and sites
  flagged `closed` are skipped.
- **Add any MediaWiki by URL** from the wikis screen's search field, which
  doubles as a URL box. The app discovers the site's `api.php`, confirms it is
  MediaWiki, reads its name and language, and records whether it has the
  `TextExtracts` and `PageImages` extensions. User-added wikis live in
  localStorage under `wiki-scroll.customWikis.v1`, not in `catalogue.json`.
- **One URL is one wiki.** MediaWiki offers no reliable way to enumerate a
  site's sibling language editions — measured across five real wikis — so
  `es.example.org` and `en.example.org` are added separately.
- **Following** is `src/feed/followStore.ts`, persisted to localStorage under
  `wiki-scroll.following.v1`.
- **Merging** is `src/wiki/mergedCursor.ts`, which combines one `FeedCursor`
  per followed site into a single cursor emitting the globally newest article.
  A site that fails is isolated and retried rather than breaking the feed.
- **The feed loads in two phases.** Phase 1 fetches titles, timestamps and
  thumbnails (~640 ms) — enough to render a card and run the image policy.
  Phase 2 fetches summaries via `WikiSource.fetchDetails` and patches them in,
  so cards appear with a shimmering description that fills a moment later.
  `extracts` is what makes the combined query 2-5x slower, which is why it
  moved to phase 2. Phase 2 costs an extra request per followed wiki per
  batch, so it is off by default; the **Load summaries** switch in Settings
  (`src/feed/preferencesStore.ts`) turns it on.
- **Change which articles appear** — implement a `FeedPolicy` in
  `src/feed/policy.ts`. The default, `requireImage`, hides the roughly half of
  recently-edited articles that have no thumbnail.
- **Support a non-MediaWiki wiki** — add a `type` to the catalogue and a branch
  in `src/wiki/sources.ts` returning a different `WikiSource`.

`src/wiki/live-check.test.ts` is a skipped integration test that hits the real
Wikipedia API. Un-skip it to verify the network path after changing sources —
but note it cannot catch CORS problems, because Node does not enforce CORS.

## Releasing

Builds and store uploads run on GitHub Actions with fastlane. See
[RELEASING.md](RELEASING.md).

## Forking this app

`src/wiki/sources.ts` sets the API User-Agent to identify this project.
[Wikimedia's User-Agent policy][ua] asks every client for an identifying string
with contact information, so a fork should change it to point at its own
repository or site:

```ts
const USER_AGENT = 'my-fork/versions (https://github.com/you/my-fork)'
```

[ua]: https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy

## License

[MIT](LICENSE). Article text and images are fetched at runtime from each wiki and remain under that wiki's own license (CC BY-SA for Wikimedia projects).
