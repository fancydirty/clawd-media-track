# Frontend Redesign: Spotify DESIGN.md + Next.js 16 Best Practices

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the MVP dashboard with a Spotify-design-language media console using Next.js 16 Cache Components (PPR), Suspense skeletons, tiered TMDB caching, and prefetched detail routes.

**Design source:** `apps/web/DESIGN.md` (Spotify, from VoltAgent/awesome-design-md). Key tokens: bg `#121212/#181818/#1f1f1f`, cards `#252525`, accent green `#1ed760` (functional only), text `#fff/#b3b3b3`, semantic red `#f3727f` / orange `#ffa42b` / blue `#539df5`, pill radius (9999px) buttons/search, heavy shadow `rgba(0,0,0,0.5) 0 8px 24px`, uppercase wide-tracked button labels. UI is achromatic; status + posters provide color.

**Next.js facts (confirmed against docs, Next 16.2):** `cacheComponents: true` in next.config makes PPR the default — `use cache` (file/function/component scope) builds the static shell, runtime reads live inside `<Suspense>` holes; `cacheLife()` sets TTL profiles; without the config flag `use cache` is a no-op. Link prefetching keeps detail navigation instant.

---

### Task F1: Design tokens + app shell

- `apps/web/app/globals.css`: replace with Spotify token set (CSS custom properties: `--bg-base:#121212; --bg-surface:#181818; --bg-card:#252525; --accent:#1ed760; --text:#fff; --text-muted:#b3b3b3; --negative:#f3727f; --warning:#ffa42b; --info:#539df5; --radius-pill:9999px; --shadow-heavy:...`), font stack per DESIGN.md fallbacks (no proprietary fonts).
- `apps/web/app/layout.tsx`: dark shell — left sidebar (媒体库: tracked seasons list, each row = title + season + status pill) + main content column; top search pill form (GET /?q=). Sidebar data inside `<Suspense>` with skeleton rows.

### Task F2: cacheComponents + tiered TMDB caching

- `next.config.ts`: `cacheComponents: true`.
- New `apps/web/lib/tmdb-cache.ts`: server-only tiered lookup per architecture doc — (1) SQLite durable cache table (`tmdb_cache`: cache_key, payload_json, fetched_at; TTL search 6h, details 24h) in the web DB via `DatabaseSync`; (2) on miss call TMDB provider; write back. Wrap the read functions with `use cache` + `cacheLife("hours")` so repeat renders don't even hit SQLite. Search page + detail page consume only this module — no direct TMDB calls from components.
- Search flow stays tiered: repository tracked-state first, cache, then TMDB.

### Task F3: Search page (/)

- `app/page.tsx`: static shell (hero + search pill) prerendered; results grid in `<Suspense fallback={<CardGridSkeleton/>}>`. Candidate cards: poster placeholder block (`#252525` w/ initial glyph), title, year, type chip, tracking state pill (可获取 / 追踪中 / 进行中) from repository. Card links to `/show/[tmdbId]/[season]` (Link prefetch default).
- `app/loading.tsx`: full-page skeleton matching shell.

### Task F4: Detail route /show/[tmdbId]/[seasonNumber]

- Server component. Static-cacheable metadata block (`use cache` over tmdb-cache read): title, year, overview, season list.
- Dynamic holes in Suspense: episode grid from `getTrackedSeasonStatusView` projection — display states map to cell styles: `unaired` low-density outline, `missing_aired` warning-tinted gap cell, `obtained` solid green-border cell, `provider_ahead` solid + blue corner hint; workflow status line (queued/running/succeeded/partial/no_coverage with semantic colors); request-track action button (existing server action), pill style.
- `app/show/[tmdbId]/[seasonNumber]/loading.tsx`: skeleton (poster block + 24-cell grid shimmer).

### Task F5: Verify

- `npm test && npm run typecheck && npm run build:web`(build proves PPR shell compiles); manual `npm run dev:web` smoke with agent-browser if available; commit per task.

Notes: keep existing server actions + demo seed working (`MEDIA_TRACK_SEARCH_PROVIDER=demo` default); TMDB live path only when env set. Do not regress request dedupe logic. Library tab content moves into sidebar + `/` recent strip; old tab UI removed.
