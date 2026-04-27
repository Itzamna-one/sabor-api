# Directory Scout Pipeline — Design Spec

**Date:** 2026-04-26
**Project:** sabor-api
**Goal:** Populate `directory_spots` Firestore collection with real Latin restaurant data using Google Places → Yelp → Claude Haiku. The directory UI (pages, components, data model) is already fully built in sabor-marketing. This spec covers only the data pipeline.

---

## Context

The directory at saboreats.com/directory is fully built:
- `/directory` — city grid (30 cities)
- `/directory/[city]` — neighborhood grid
- `/directory/[city]/[neighborhood]` — spot cards (shows "Scouting in progress" when empty)
- `/directory/[city]/[neighborhood]/[slug]` — spot detail page

The `directory_spots` Firestore collection exists but is empty. Every neighborhood shows "Scouting in progress." This spec defines the pipeline that fills it.

**Why Google Places instead of Claude:** Prior spec used Claude Sonnet to generate restaurant names from training knowledge. This risks hallucinated/closed restaurants. Google Places returns verified, live businesses with addresses, photos, and ratings.

---

## Architecture

Three new files in `sabor-api/api/admin/`:

1. **`scout-directory.js`** — core scout endpoint. Takes `city` + `neighborhood` query params. Runs one Google Places search, enriches with Yelp, generates descriptions with Haiku, upserts to Firestore. Protected by `X-API-Secret`.

2. **`seed-directory.js`** — one-time seed endpoint. Loops all city × neighborhood pairs from a hardcoded list, calls scout-directory sequentially with 300ms delay. Returns a summary of seeded/skipped counts. Protected by `X-API-Secret`.

New cron entries in `vercel.json`:
- Chicago: weekly Sunday 1pm UTC
- Other cities: one per day on days 1–29 of each month (one city per day)

---

## Scout Endpoint — `api/admin/scout-directory.js`

### Request
```
POST /api/admin/scout-directory?city=chicago&neighborhood=pilsen
Headers: X-API-Secret: <NOTIFY_API_SECRET>
```

### Step 1: Resolve Coordinates

```javascript
const CHICAGO_CENTROIDS = {
  'pilsen':              { lat: 41.8535, lng: -87.6595 },
  'little-village':      { lat: 41.8495, lng: -87.7054 },
  'humboldt-park':       { lat: 41.9000, lng: -87.7228 },
  'east-garfield-park':  { lat: 41.8811, lng: -87.7243 },
  'west-garfield-park':  { lat: 41.8811, lng: -87.7365 },
  'back-of-the-yards':   { lat: 41.8014, lng: -87.6618 },
  'brighton-park':       { lat: 41.8240, lng: -87.6982 },
  'gage-park':           { lat: 41.8112, lng: -87.7043 },
  'logan-square':        { lat: 41.9217, lng: -87.7010 },
  'avondale':            { lat: 41.9401, lng: -87.7116 },
  'wicker-park':         { lat: 41.9080, lng: -87.6778 },
  'albany-park':         { lat: 41.9680, lng: -87.7235 },
  'uptown':              { lat: 41.9650, lng: -87.6536 },
  'lakeview':            { lat: 41.9440, lng: -87.6534 },
  'lincoln-park':        { lat: 41.9226, lng: -87.6520 },
  'rogers-park':         { lat: 42.0067, lng: -87.6671 },
  'bridgeport':          { lat: 41.8342, lng: -87.6435 },
  'chinatown':           { lat: 41.8527, lng: -87.6327 },
  'bronzeville':         { lat: 41.8309, lng: -87.6148 },
  'hyde-park':           { lat: 41.7943, lng: -87.5907 },
  'west-loop':           { lat: 41.8830, lng: -87.6470 },
  'west-town':           { lat: 41.9010, lng: -87.6778 },
  'river-north':         { lat: 41.8923, lng: -87.6337 },
  'cicero':              { lat: 41.8456, lng: -87.7537 },
  'berwyn':              { lat: 41.8500, lng: -87.7940 },
};

// CITY_GEO fallback — copy the full CITY_GEO map from home-feed.js verbatim.
// All 30 cities must be present. Do not invent coordinates.
const CITY_GEO = {
  'chicago':        { lat: 41.8781, lng: -87.6298 },
  'aurora':         { lat: 41.7606, lng: -88.3201 },
  'joliet':         { lat: 41.5250, lng: -88.0817 },
  // ... (copy remaining entries from sabor-api/api/home-feed.js CITY_GEO)
};
```

Resolution logic:
- If `city === 'chicago'`: look up `CHICAGO_CENTROIDS[neighborhoodSlug]`, fall back to Chicago city center
- All other cities: use `CITY_GEO[citySlug]`

### Step 2: Google Places Text Search

```
GET https://maps.googleapis.com/maps/api/place/textsearch/json
  ?query=latin+restaurant+{neighborhoodLabel}+{cityLabel}
  &location={lat},{lng}
  &radius=2000
  &type=restaurant
  &key=GOOGLE_PLACES_API_KEY
```

Take up to 15 results. Filter out any result where `business_status !== 'OPERATIONAL'`.

For each result, extract:
- `place_id`, `name`, `formatted_address`, `geometry.location` (lat/lng)
- `rating`, `user_ratings_total`, `price_level`
- `photos[0].photo_reference` → build photo URL

### Step 3: Yelp Enrichment

For each Place result, call Yelp Business Match API:
```
GET https://api.yelp.com/v3/businesses/matches
  ?name={name}
  &address1={address}
  &city={city}
  &state={state}
  &country=US
```

From Yelp result, extract:
- `categories` → map to cuisine label (see Cuisine Mapping below)
- `photos[0]` → use as `photoUrl` if available (better quality than Google)
- `review_count` → use as `reviewCount` if Yelp has more reviews than Google

If Yelp returns no match: use Google photo URL and derive cuisine from place `types`.

### Cuisine Mapping

```javascript
const CUISINE_MAP = {
  'mexican':          'Mexican',
  'tacos':            'Mexican',
  'tex-mex':          'Mexican',
  'latin':            'Latin American',
  'colombian':        'Colombian',
  'cuban':            'Cuban',
  'salvadoran':       'Salvadoran',
  'honduran':         'Honduran',
  'guatemalan':       'Guatemalan',
  'peruvian':         'Peruvian',
  'puerto_rican':     'Puerto Rican',
  'dominican':        'Dominican',
  'venezuelan':       'Venezuelan',
  'argentinian':      'Argentinian',
  'caribbean':        'Caribbean',
  'spanish':          'Spanish',
  'brazilian':        'Brazilian',
  'seafood':          'Seafood',
  'pizza':            'Pizza',
  'burgers':          'American',
  'sandwiches':       'Sandwiches',
  'breakfast_brunch': 'Brunch',
  'chinese':          'Chinese',
  'soulFood':         'Soul Food',
};
```

Default to `'Latin American'` if no Yelp category matches.

### Step 4: Claude Haiku Description

Single Haiku call per scout run (batch all spots together, not one call per spot):

```
System: You write punchy one-sentence descriptions for Latin restaurant listings. 
Match the SABOR brand: direct, community-voice, no adjective soup. 
Sound like a knowledgeable neighbor, not a food blogger.

User: Write one-sentence descriptions for these restaurants in {neighborhoodLabel}, {cityLabel}.
Return a JSON object: { "Restaurant Name": "description", ... }

Restaurants:
- El Milagro Taqueria (Mexican) at 2154 S Blue Island Ave
- Carnitas Uruapan (Mexican) at 1725 W 18th St
...
```

Max 700 tokens. If Haiku call fails or times out, use an empty string for description (not a blocker).

### Step 5: Slug Generation

```javascript
function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[',\.]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

const spotSlug = toSlug(restaurantName);
const docId = `${citySlug}_${neighborhoodSlug}_${spotSlug}`;
```

### Step 6: Firestore Upsert

```javascript
await db.collection('directory_spots').doc(docId).set({
  slug: spotSlug,
  restaurantName,
  city: citySlug,
  cityLabel,
  neighborhood: neighborhoodSlug,
  neighborhoodLabel,
  cuisine,
  description,
  address,
  lat,
  lng,
  photoUrl,
  rating,
  reviewCount,
  priceLevel: priceLevel ?? 1,
  tags: deriveTags(cuisine, neighborhoodSlug),
  source: 'scouted',
  tier: 'free',
  updatedAt: now,
  // Only set on first write — merge:true preserves these if already set by owner
  ...(isNew ? {
    savesCount: 0,
    ownerId: null,
    currentSpecial: null,
    scoutedAt: now,
  } : {}),
}, { merge: true });

// isNew detection — do a get() before the batch write:
// const existing = await db.collection('directory_spots').doc(docId).get();
// const isNew = !existing.exists;
```

`merge: true` ensures that if an owner has claimed the spot, their `ownerId`, `currentSpecial`, `tier`, and `source: 'claimed'` are never overwritten.

**Upsert safety check:** Before writing, check if existing doc has `source === 'claimed'`. If so, only update `photoUrl`, `rating`, `reviewCount`, `address`, `updatedAt` — never touch `currentSpecial`, `tier`, `ownerId`.

### Response

```json
{
  "success": true,
  "city": "chicago",
  "neighborhood": "pilsen",
  "found": 15,
  "upserted": 15,
  "skipped": 0
}
```

---

## Seed Endpoint — `api/admin/seed-directory.js`

Loops all city × neighborhood pairs and calls the **scout logic directly as an imported function** — not via HTTP self-call (Vercel cold-start on self-calls is unreliable). Extract the core scout logic from `scout-directory.js` into a shared function `scoutNeighborhood(city, neighborhood, db)` and import it in both files.

```javascript
const ALL_PAIRS = [
  { city: 'chicago', neighborhood: 'pilsen', cityLabel: 'Chicago, IL', neighborhoodLabel: 'Pilsen' },
  { city: 'chicago', neighborhood: 'little-village', ... },
  // ... all ~100 pairs
];
```

Query param `?startAt=N` allows resuming from a specific index if it times out (Vercel 60s limit).

Returns:
```json
{
  "success": true,
  "processed": 12,
  "total": 104,
  "nextStartAt": 12,
  "results": [...]
}
```

Caller runs again with `?startAt=12` until `processed === total`.

---

## Cron Schedule (`vercel.json`)

```json
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=pilsen&cron=1",      "schedule": "0 13 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=little-village&cron=1", "schedule": "5 13 * * 0" },
// ... all 25 Chicago neighborhoods on Sunday, 5 min apart
{ "path": "/api/admin/scout-directory?city=aurora&neighborhood=downtown-aurora&cron=1", "schedule": "0 13 1 * *" },
{ "path": "/api/admin/scout-directory?city=joliet&neighborhood=downtown-joliet&cron=1", "schedule": "0 13 2 * *" },
// ... one non-Chicago city per day of month
```

Cron calls use `?cron=1` param. Auth check:
- Admin calls: `X-API-Secret` header === `NOTIFY_API_SECRET`
- Vercel cron calls: `Authorization: Bearer <CRON_SECRET>` header (Vercel injects this automatically)

```javascript
const secret = req.headers['x-api-secret'];
const cronAuth = req.headers['authorization'];
const isCron = cronAuth === `Bearer ${process.env.CRON_SECRET}`;
const isAdmin = secret === process.env.NOTIFY_API_SECRET;
if (!isCron && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });
```

---

## Environment Variables Required

- `GOOGLE_PLACES_API_KEY` — already used in home-feed.js
- `YELP_API_KEY` — already used in places-enrich.js
- `ANTHROPIC_API_KEY` — already used in search.js
- `NOTIFY_API_SECRET` — already set (reused for admin auth)
- `FIREBASE_SERVICE_ACCOUNT` — already set

No new environment variables needed.

---

## Tags Derivation

```javascript
function deriveTags(cuisine, neighborhood) {
  const tags = [cuisine.toLowerCase()];
  if (['pilsen','little-village','back-of-the-yards','gage-park','brighton-park'].includes(neighborhood)) {
    tags.push('authentic', 'community');
  }
  if (cuisine === 'Mexican') tags.push('tacos');
  if (cuisine === 'Puerto Rican') tags.push('jibaritos');
  return tags;
}
```

---

## Scope Boundaries

**In scope:**
- `api/admin/scout-directory.js`
- `api/admin/seed-directory.js`
- `vercel.json` cron additions

**Out of scope (already done):**
- Directory pages (fully built in sabor-marketing)
- `DirectorySpot` type, `directory.ts` queries (already in sabor-marketing/lib)
- Owner claiming flow (already built)
- Sitemap (already includes directory routes)
