# SABOR API

Vercel Node.js backend deployed at https://sabor-api.vercel.app
GitHub: github.com/Itzamna-one/sabor-api.git

## Stack
- Node.js + ES modules (import/export) on Vercel serverless functions
- Anthropic SDK direct (`@anthropic-ai/sdk`) — NOT Vercel AI SDK
- Firebase Admin SDK (initialized at top of each file that needs it)
- 60s function timeout (Vercel Pro)

## API Endpoints (`api/`)
- `search.js` — AI restaurant search. Premium: claude-sonnet-4-20250514 (1400 tokens). Free: claude-haiku-4-5-20251001 (700 tokens). Logs queries to `search_logs` Firestore collection (fire-and-forget).
- `notify.js` — Push notifications via FCM. POST, requires `X-API-Secret` header. Reads `fcm_tokens` collection, sends multicast, cleans invalid tokens.
- `events.js` — Ticketmaster + curated SABOR events. Sorted: today first, Ticketmaster before curated.
- `home-feed.js` — Home screen sections (hot/gems/trending/new/rated/local). Uses `CITY_GEO` for Google Places geo-bias.
- `neighborhoods.js` — Neighborhood list per city.
- `places-enrich.js` — Yelp enrichment for photos + ratings.
- `trends.js` — Google Trends RSS + curated Chicago food trends.

## Firestore Collections Written Here
- `fcm_tokens` — device push tokens (written by Flutter app via notify.js)
- `search_logs` — query, city, tier, language, neighborhood, timestamp (written by search.js)
- `event_rsvps` — user event RSVPs
- `vendor_submissions` — restaurant submissions

## Key Patterns
- Each file initializes Firebase Admin at top: `if (!getApps().length) { initializeApp(...) }`
- `FIREBASE_SERVICE_ACCOUNT` env var = JSON string of service account
- `NOTIFY_API_SECRET` env var protects notify.js
- `ANTHROPIC_API_KEY` env var for Claude calls
- In-memory cache in search.js: 1-hour TTL, 500 entry max, skipped for street/vendor/plan queries
- `CITY_GEO` map in search.js and home-feed.js must stay in sync when adding cities

## Critical Gotchas
- search.js is 1000+ lines — read before editing, neighborhood resolver is complex
- `logSearch()` in search.js is fire-and-forget — never await it, never let it throw
- Cache bypass queries: street food, vendor, truck, "similar to", "plan my"
- Premium check uses `tier === 'premium'` string (from Flutter request body)
- Ticketmaster has few food events — search music/arts too
- `conSabor` param flows from Flutter toggle → API body → Claude prompt
- Vercel runs UTC — Flutter sends `localHour` for time-aware features
