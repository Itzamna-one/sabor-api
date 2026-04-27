# Directory Scout Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the `directory_spots` Firestore collection with real restaurant data by building a Google Places → Claude Haiku → Firestore scout pipeline.

**Architecture:** A shared `scout-core.js` module contains all scout logic; a thin HTTP endpoint wraps it for admin/cron calls; a seed endpoint loops all city×neighborhood pairs for initial population. The directory UI in sabor-marketing is already fully built and reads from `directory_spots` — no UI changes needed.

**Tech Stack:** Node.js ES modules, Firebase Admin SDK, Google Places API v1 (new), Anthropic SDK (`claude-haiku-4-5-20251001`), Vercel serverless functions

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `api/admin/scout-core.js` | Create | Shared `scoutNeighborhood()` function — all scout logic lives here |
| `api/admin/scout-directory.js` | Create | HTTP endpoint wrapper — auth, param parsing, calls scoutNeighborhood() |
| `api/admin/seed-directory.js` | Create | Loops all city×neighborhood pairs, calls scoutNeighborhood() sequentially |
| `vercel.json` | Modify | Add weekly Chicago crons + monthly non-Chicago city crons |

---

## Task 1: Core Scout Module (`api/admin/scout-core.js`)

**Files:**
- Create: `api/admin/scout-core.js`

- [ ] **Step 1: Create the file with imports, coordinate maps, and helpers**

```javascript
// api/admin/scout-core.js
import Anthropic from '@anthropic-ai/sdk';

// ── Coordinates ─────────────────────────────────────────────────────────────

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

// Copied verbatim from api/home-feed.js CITY_GEO
const CITY_GEO = {
  'chicago':        { lat: 41.8781, lng: -87.6298 },
  'aurora':         { lat: 41.7606, lng: -88.3201 },
  'joliet':         { lat: 41.5250, lng: -88.0817 },
  'naperville':     { lat: 41.7508, lng: -88.1535 },
  'elgin':          { lat: 42.0354, lng: -88.2826 },
  'waukegan':       { lat: 42.3636, lng: -87.8448 },
  'cicero':         { lat: 41.8456, lng: -87.7539 },
  'berwyn':         { lat: 41.8506, lng: -87.7937 },
  'rockford':       { lat: 42.2711, lng: -89.0940 },
  'springfield':    { lat: 39.7817, lng: -89.6501 },
  'champaign':      { lat: 40.1164, lng: -88.2434 },
  'evanston':       { lat: 42.0451, lng: -87.6877 },
  'schaumburg':     { lat: 42.0334, lng: -88.0834 },
  'peoria':         { lat: 40.6936, lng: -89.5890 },
  'bloomington-il': { lat: 40.4842, lng: -88.9937 },
  'decatur':        { lat: 39.8403, lng: -88.9548 },
  'dekalb':         { lat: 41.9295, lng: -88.7503 },
  'gary':           { lat: 41.5934, lng: -87.3464 },
  'east-chicago':   { lat: 41.6392, lng: -87.4545 },
  'hammond':        { lat: 41.5834, lng: -87.5001 },
  'indianapolis':   { lat: 39.7684, lng: -86.1581 },
  'fort-wayne':     { lat: 41.0793, lng: -85.1394 },
  'south-bend':     { lat: 41.6764, lng: -86.2520 },
  'valparaiso':     { lat: 41.4731, lng: -87.0611 },
  'evansville':     { lat: 37.9716, lng: -87.5711 },
  'bloomington-in': { lat: 39.1653, lng: -86.5264 },
  'terre-haute':    { lat: 39.4667, lng: -87.4139 },
  'lafayette':      { lat: 40.4167, lng: -86.8753 },
  'muncie':         { lat: 40.1934, lng: -85.3864 },
  'michigan-city':  { lat: 41.7075, lng: -86.8950 },
};

// ── Cuisine mapping from Google Places types ─────────────────────────────────

const TYPE_TO_CUISINE = {
  'mexican_restaurant':        'Mexican',
  'taco_restaurant':           'Mexican',
  'latin_american_restaurant': 'Latin American',
  'colombian_restaurant':      'Colombian',
  'salvadoran_restaurant':     'Salvadoran',
  'peruvian_restaurant':       'Peruvian',
  'cuban_restaurant':          'Cuban',
  'honduran_restaurant':       'Honduran',
  'guatemalan_restaurant':     'Guatemalan',
  'venezuelan_restaurant':     'Venezuelan',
  'spanish_restaurant':        'Spanish',
  'brazilian_restaurant':      'Brazilian',
  'caribbean_restaurant':      'Caribbean',
  'seafood_restaurant':        'Seafood',
  'pizza_restaurant':          'Pizza',
  'hamburger_restaurant':      'American',
  'sandwich_shop':             'Sandwiches',
  'breakfast_restaurant':      'Brunch',
  'brunch_restaurant':         'Brunch',
  'chinese_restaurant':        'Chinese',
  'soul_food_restaurant':      'Soul Food',
  'barbecue_restaurant':       'BBQ',
  'ramen_restaurant':          'Japanese',
  'sushi_restaurant':          'Japanese',
  'vietnamese_restaurant':     'Vietnamese',
  'thai_restaurant':           'Thai',
  'indian_restaurant':         'Indian',
  'korean_restaurant':         'Korean',
  'italian_restaurant':        'Italian',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export function toSlug(s) {
  return s
    .toLowerCase()
    .replace(/[',\.]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function getCoords(citySlug, neighborhoodSlug) {
  if (citySlug === 'chicago' && CHICAGO_CENTROIDS[neighborhoodSlug]) {
    return CHICAGO_CENTROIDS[neighborhoodSlug];
  }
  return CITY_GEO[citySlug] || CITY_GEO['chicago'];
}

function getCuisine(types = []) {
  for (const t of types) {
    if (TYPE_TO_CUISINE[t]) return TYPE_TO_CUISINE[t];
  }
  return 'Latin American';
}

function deriveTags(cuisine, neighborhoodSlug) {
  const tags = [cuisine.toLowerCase()];
  const latinNeighborhoods = ['pilsen','little-village','back-of-the-yards','gage-park','brighton-park','humboldt-park'];
  if (latinNeighborhoods.includes(neighborhoodSlug)) tags.push('authentic', 'community');
  if (cuisine === 'Mexican') tags.push('tacos');
  if (cuisine === 'Puerto Rican') tags.push('jibaritos');
  return tags;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
```

- [ ] **Step 2: Add the Google Places search function**

Append to `api/admin/scout-core.js`:

```javascript
// ── Google Places Text Search ────────────────────────────────────────────────

async function searchPlaces(neighborhoodLabel, cityLabel, coords, apiKey) {
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.displayName,places.id,places.rating,places.userRatingCount,places.priceLevel,places.formattedAddress,places.location,places.photos,places.businessStatus,places.types,places.primaryType',
    },
    body: JSON.stringify({
      textQuery: `restaurant ${neighborhoodLabel} ${cityLabel}`,
      maxResultCount: 15,
      locationBias: {
        circle: {
          center: { latitude: coords.lat, longitude: coords.lng },
          radius: 1500,
        },
      },
    }),
  });

  if (!r.ok) throw new Error(`Places API error: ${r.status}`);
  const data = await r.json();
  return (data.places || []).filter(p => p.businessStatus === 'OPERATIONAL' || !p.businessStatus);
}
```

- [ ] **Step 3: Add the Haiku description generator**

Append to `api/admin/scout-core.js`:

```javascript
// ── Claude Haiku description generator ──────────────────────────────────────

async function generateDescriptions(spots, neighborhoodLabel, cityLabel) {
  if (!spots.length) return {};
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const list = spots.map(s => `- ${s.name} (${s.cuisine})`).join('\n');
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      messages: [{
        role: 'user',
        content: `Write one punchy sentence per restaurant for a food directory listing in ${neighborhoodLabel}, ${cityLabel}.
Sound like a knowledgeable neighbor, not a food blogger. Direct, warm, specific. No filler adjectives.
Return ONLY a JSON object: { "Restaurant Name": "description sentence." }

Restaurants:
${list}`,
      }],
    });

    const raw = msg.content[0]?.text || '';
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  } catch {
    return {};
  }
}
```

- [ ] **Step 4: Add the main `scoutNeighborhood` export function**

Append to `api/admin/scout-core.js`:

```javascript
// ── Main export ──────────────────────────────────────────────────────────────

export async function scoutNeighborhood(citySlug, cityLabel, neighborhoodSlug, neighborhoodLabel, db) {
  const apiKey = process.env.GOOGLE_PLACES_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_KEY not set');

  const coords = getCoords(citySlug, neighborhoodSlug);
  const places = await searchPlaces(neighborhoodLabel, cityLabel, coords, apiKey);

  // Build spot list with cuisine
  const spots = places.map(p => ({
    name: p.displayName?.text || '',
    cuisine: getCuisine(p.types || []),
    address: p.formattedAddress || '',
    lat: p.location?.latitude ?? 0,
    lng: p.location?.longitude ?? 0,
    rating: p.rating ?? 0,
    reviewCount: p.userRatingCount ?? 0,
    priceLevel: { PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 }[p.priceLevel] ?? 1,
    photoUrl: p.photos?.[0]?.name
      ? `https://sabor-api.vercel.app/api/photo?ref=${encodeURIComponent(p.photos[0].name)}`
      : null,
  })).filter(s => s.name);

  // Generate descriptions in one Haiku batch call
  const descriptions = await generateDescriptions(spots, neighborhoodLabel, cityLabel);

  const now = new Date().toISOString();
  const collection = db.collection('directory_spots');
  let upserted = 0;
  let skipped = 0;

  for (const spot of spots) {
    const slug = toSlug(spot.name);
    if (!slug) continue;
    const docId = `${citySlug}_${neighborhoodSlug}_${slug}`;

    const existing = await collection.doc(docId).get();
    const isNew = !existing.exists;
    const isClaimed = existing.exists && existing.data()?.source === 'claimed';

    const update = {
      slug,
      restaurantName: spot.name,
      city: citySlug,
      cityLabel,
      neighborhood: neighborhoodSlug,
      neighborhoodLabel,
      cuisine: spot.cuisine,
      description: descriptions[spot.name] || '',
      address: spot.address,
      lat: spot.lat,
      lng: spot.lng,
      photoUrl: spot.photoUrl,
      rating: spot.rating,
      reviewCount: spot.reviewCount,
      priceLevel: spot.priceLevel,
      tags: deriveTags(spot.cuisine, neighborhoodSlug),
      source: isClaimed ? 'claimed' : 'scouted',
      tier: isNew ? 'free' : (existing.data()?.tier ?? 'free'),
      updatedAt: now,
      ...(isNew && {
        savesCount: 0,
        ownerId: null,
        currentSpecial: null,
        scoutedAt: now,
      }),
    };

    await collection.doc(docId).set(update, { merge: true });
    upserted++;
  }

  return { found: places.length, upserted, skipped };
}
```

- [ ] **Step 5: Verify the file has no syntax errors**

Run:
```bash
cd /Users/immaculateentertainment/Desktop/Sabor_Main/sabor-api
node --input-type=module < api/admin/scout-core.js
```
Expected: no output (module-level code only exports, no side effects)

- [ ] **Step 6: Commit**

```bash
git add api/admin/scout-core.js
git commit -m "feat: add scout-core module with Places + Haiku pipeline"
```

---

## Task 2: Scout HTTP Endpoint (`api/admin/scout-directory.js`)

**Files:**
- Create: `api/admin/scout-directory.js`

- [ ] **Step 1: Write the endpoint**

```javascript
// api/admin/scout-directory.js
// Scout one neighborhood: POST /api/admin/scout-directory?city=chicago&neighborhood=pilsen
// Auth: X-API-Secret header (admin) OR Authorization: Bearer <CRON_SECRET> (Vercel cron)

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { scoutNeighborhood } from './scout-core.js';

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

// Labels map — needed to convert slug back to display label for Places query
const CITY_LABELS = {
  'chicago': 'Chicago, IL', 'aurora': 'Aurora, IL', 'joliet': 'Joliet, IL',
  'naperville': 'Naperville, IL', 'elgin': 'Elgin, IL', 'waukegan': 'Waukegan, IL',
  'cicero': 'Cicero, IL', 'berwyn': 'Berwyn, IL', 'rockford': 'Rockford, IL',
  'springfield': 'Springfield, IL', 'champaign': 'Champaign, IL', 'evanston': 'Evanston, IL',
  'schaumburg': 'Schaumburg, IL', 'peoria': 'Peoria, IL', 'bloomington-il': 'Bloomington, IL',
  'decatur': 'Decatur, IL', 'dekalb': 'DeKalb, IL', 'gary': 'Gary, IN',
  'east-chicago': 'East Chicago, IN', 'hammond': 'Hammond, IN', 'indianapolis': 'Indianapolis, IN',
  'fort-wayne': 'Fort Wayne, IN', 'south-bend': 'South Bend, IN', 'valparaiso': 'Valparaiso, IN',
  'evansville': 'Evansville, IN', 'bloomington-in': 'Bloomington, IN',
  'terre-haute': 'Terre Haute, IN', 'lafayette': 'Lafayette, IN',
  'muncie': 'Muncie, IN', 'michigan-city': 'Michigan City, IN',
};

function fromSlug(s) {
  return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Secret, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.headers['x-api-secret'];
  const cronAuth = req.headers['authorization'];
  const isAdmin = secret === process.env.NOTIFY_API_SECRET;
  const isCron = cronAuth === `Bearer ${process.env.CRON_SECRET}`;
  if (!isAdmin && !isCron) return res.status(401).json({ error: 'Unauthorized' });

  const { city: citySlug, neighborhood: neighborhoodSlug } = req.query;
  if (!citySlug || !neighborhoodSlug) {
    return res.status(400).json({ error: 'city and neighborhood query params required' });
  }

  const cityLabel = CITY_LABELS[citySlug];
  if (!cityLabel) return res.status(400).json({ error: `Unknown city: ${citySlug}` });

  const neighborhoodLabel = fromSlug(neighborhoodSlug);

  try {
    const result = await scoutNeighborhood(citySlug, cityLabel, neighborhoodSlug, neighborhoodLabel, db);
    return res.status(200).json({ success: true, city: citySlug, neighborhood: neighborhoodSlug, ...result });
  } catch (err) {
    console.error('Scout error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
```

- [ ] **Step 2: Deploy and test with Pilsen**

Push to GitHub and wait for Vercel deploy (~60s), then run:
```bash
curl -s -X POST "https://sabor-api.vercel.app/api/admin/scout-directory?city=chicago&neighborhood=pilsen" \
  -H "X-API-Secret: sabor_notify_2026_secret" | jq .
```
Expected:
```json
{ "success": true, "city": "chicago", "neighborhood": "pilsen", "found": 15, "upserted": 15, "skipped": 0 }
```

- [ ] **Step 3: Open Firebase Console and verify docs were created**

Go to Firebase Console → Firestore → `directory_spots` collection.
Expected: Documents with IDs like `chicago_pilsen_carnitas-uruapan`, each containing all fields: `restaurantName`, `cuisine`, `description`, `rating`, `photoUrl`, `source: "scouted"`, `tier: "free"`.

- [ ] **Step 4: Test that claimed spots are not overwritten**

In Firebase Console, manually set one doc's `source` to `"claimed"` and `currentSpecial` to `"Test special"`. Re-run the scout. Verify the doc still has `source: "claimed"` and `currentSpecial: "Test special"` after re-scout.

- [ ] **Step 5: Commit**

```bash
git add api/admin/scout-directory.js
git commit -m "feat: add scout-directory HTTP endpoint"
```

---

## Task 3: Seed Endpoint (`api/admin/seed-directory.js`)

**Files:**
- Create: `api/admin/seed-directory.js`

- [ ] **Step 1: Write the ALL_PAIRS list and endpoint**

```javascript
// api/admin/seed-directory.js
// Seed all city×neighborhood pairs.
// POST /api/admin/seed-directory?startAt=0
// Resume with ?startAt=N if it times out (Vercel 60s limit).

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { scoutNeighborhood } from './scout-core.js';

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

const ALL_PAIRS = [
  // ── CHICAGO (25 neighborhoods) ──
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'pilsen',             neighborhoodLabel: 'Pilsen' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'little-village',     neighborhoodLabel: 'Little Village' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'humboldt-park',      neighborhoodLabel: 'Humboldt Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'east-garfield-park', neighborhoodLabel: 'East Garfield Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'west-garfield-park', neighborhoodLabel: 'West Garfield Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'back-of-the-yards',  neighborhoodLabel: 'Back of the Yards' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'brighton-park',      neighborhoodLabel: 'Brighton Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'gage-park',          neighborhoodLabel: 'Gage Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'logan-square',       neighborhoodLabel: 'Logan Square' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'avondale',           neighborhoodLabel: 'Avondale' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'wicker-park',        neighborhoodLabel: 'Wicker Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'albany-park',        neighborhoodLabel: 'Albany Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'uptown',             neighborhoodLabel: 'Uptown' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'lakeview',           neighborhoodLabel: 'Lakeview' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'lincoln-park',       neighborhoodLabel: 'Lincoln Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'rogers-park',        neighborhoodLabel: 'Rogers Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'bridgeport',         neighborhoodLabel: 'Bridgeport' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'chinatown',          neighborhoodLabel: 'Chinatown' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'bronzeville',        neighborhoodLabel: 'Bronzeville' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'hyde-park',          neighborhoodLabel: 'Hyde Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'west-loop',          neighborhoodLabel: 'West Loop' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'west-town',          neighborhoodLabel: 'West Town' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'river-north',        neighborhoodLabel: 'River North' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'cicero',             neighborhoodLabel: 'Cicero' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'berwyn',             neighborhoodLabel: 'Berwyn' },
  // ── AURORA ──
  { city: 'aurora', cityLabel: 'Aurora, IL', neighborhood: 'downtown-aurora',  neighborhoodLabel: 'Downtown Aurora' },
  { city: 'aurora', cityLabel: 'Aurora, IL', neighborhood: 'east-side',        neighborhoodLabel: 'East Side' },
  { city: 'aurora', cityLabel: 'Aurora, IL', neighborhood: 'new-york-street',  neighborhoodLabel: 'New York Street' },
  { city: 'aurora', cityLabel: 'Aurora, IL', neighborhood: 'fox-valley',       neighborhoodLabel: 'Fox Valley' },
  // ── JOLIET ──
  { city: 'joliet', cityLabel: 'Joliet, IL', neighborhood: 'downtown-joliet',   neighborhoodLabel: 'Downtown Joliet' },
  { city: 'joliet', cityLabel: 'Joliet, IL', neighborhood: 'east-side',         neighborhoodLabel: 'East Side' },
  { city: 'joliet', cityLabel: 'Joliet, IL', neighborhood: 'louis-rd-corridor', neighborhoodLabel: 'Louis Rd Corridor' },
  // ── NAPERVILLE ──
  { city: 'naperville', cityLabel: 'Naperville, IL', neighborhood: 'downtown-naperville', neighborhoodLabel: 'Downtown Naperville' },
  { city: 'naperville', cityLabel: 'Naperville, IL', neighborhood: 'south-naperville',    neighborhoodLabel: 'South Naperville' },
  { city: 'naperville', cityLabel: 'Naperville, IL', neighborhood: 'route-59',            neighborhoodLabel: 'Route 59' },
  // ── ELGIN ──
  { city: 'elgin', cityLabel: 'Elgin, IL', neighborhood: 'downtown-elgin', neighborhoodLabel: 'Downtown Elgin' },
  { city: 'elgin', cityLabel: 'Elgin, IL', neighborhood: 'mclean-blvd',    neighborhoodLabel: 'McLean Blvd' },
  { city: 'elgin', cityLabel: 'Elgin, IL', neighborhood: 'dundee-ave',     neighborhoodLabel: 'Dundee Ave' },
  // ── WAUKEGAN ──
  { city: 'waukegan', cityLabel: 'Waukegan, IL', neighborhood: 'downtown-waukegan', neighborhoodLabel: 'Downtown Waukegan' },
  { city: 'waukegan', cityLabel: 'Waukegan, IL', neighborhood: 'belvidere-rd',      neighborhoodLabel: 'Belvidere Rd' },
  { city: 'waukegan', cityLabel: 'Waukegan, IL', neighborhood: 'grand-ave',         neighborhoodLabel: 'Grand Ave' },
  // ── CICERO ──
  { city: 'cicero', cityLabel: 'Cicero, IL', neighborhood: 'cermak-road',  neighborhoodLabel: 'Cermak Road' },
  { city: 'cicero', cityLabel: 'Cicero, IL', neighborhood: '26th-street',  neighborhoodLabel: '26th Street' },
  { city: 'cicero', cityLabel: 'Cicero, IL', neighborhood: 'roosevelt-rd', neighborhoodLabel: 'Roosevelt Rd' },
  // ── BERWYN ──
  { city: 'berwyn', cityLabel: 'Berwyn, IL', neighborhood: 'cermak-road',    neighborhoodLabel: 'Cermak Road' },
  { city: 'berwyn', cityLabel: 'Berwyn, IL', neighborhood: 'roosevelt-rd',   neighborhoodLabel: 'Roosevelt Rd' },
  { city: 'berwyn', cityLabel: 'Berwyn, IL', neighborhood: 'depot-district', neighborhoodLabel: 'Depot District' },
  // ── ROCKFORD ──
  { city: 'rockford', cityLabel: 'Rockford, IL', neighborhood: 'downtown-rockford', neighborhoodLabel: 'Downtown Rockford' },
  { city: 'rockford', cityLabel: 'Rockford, IL', neighborhood: 'broadway',           neighborhoodLabel: 'Broadway' },
  { city: 'rockford', cityLabel: 'Rockford, IL', neighborhood: 'east-state-street',  neighborhoodLabel: 'East State Street' },
  // ── SPRINGFIELD ──
  { city: 'springfield', cityLabel: 'Springfield, IL', neighborhood: 'downtown',        neighborhoodLabel: 'Downtown' },
  { city: 'springfield', cityLabel: 'Springfield, IL', neighborhood: 'south-grand',     neighborhoodLabel: 'South Grand' },
  { city: 'springfield', cityLabel: 'Springfield, IL', neighborhood: 'dirksen-parkway', neighborhoodLabel: 'Dirksen Parkway' },
  // ── CHAMPAIGN ──
  { city: 'champaign', cityLabel: 'Champaign, IL', neighborhood: 'campustown',         neighborhoodLabel: 'Campustown' },
  { city: 'champaign', cityLabel: 'Champaign, IL', neighborhood: 'downtown-champaign', neighborhoodLabel: 'Downtown Champaign' },
  { city: 'champaign', cityLabel: 'Champaign, IL', neighborhood: 'green-street',       neighborhoodLabel: 'Green Street' },
  // ── EVANSTON ──
  { city: 'evanston', cityLabel: 'Evanston, IL', neighborhood: 'downtown-evanston', neighborhoodLabel: 'Downtown Evanston' },
  { city: 'evanston', cityLabel: 'Evanston, IL', neighborhood: 'central-street',    neighborhoodLabel: 'Central Street' },
  { city: 'evanston', cityLabel: 'Evanston, IL', neighborhood: 'dempster-street',   neighborhoodLabel: 'Dempster Street' },
  // ── SCHAUMBURG ──
  { city: 'schaumburg', cityLabel: 'Schaumburg, IL', neighborhood: 'woodfield-area', neighborhoodLabel: 'Woodfield Area' },
  { city: 'schaumburg', cityLabel: 'Schaumburg, IL', neighborhood: 'golf-road',      neighborhoodLabel: 'Golf Road' },
  { city: 'schaumburg', cityLabel: 'Schaumburg, IL', neighborhood: 'higgins-road',   neighborhoodLabel: 'Higgins Road' },
  // ── PEORIA ──
  { city: 'peoria', cityLabel: 'Peoria, IL', neighborhood: 'downtown-peoria', neighborhoodLabel: 'Downtown Peoria' },
  { city: 'peoria', cityLabel: 'Peoria, IL', neighborhood: 'junction-city',   neighborhoodLabel: 'Junction City' },
  // ── BLOOMINGTON IL ──
  { city: 'bloomington-il', cityLabel: 'Bloomington, IL', neighborhood: 'downtown-bloomington', neighborhoodLabel: 'Downtown Bloomington' },
  { city: 'bloomington-il', cityLabel: 'Bloomington, IL', neighborhood: 'veterans-pkwy',        neighborhoodLabel: 'Veterans Pkwy' },
  // ── DECATUR ──
  { city: 'decatur', cityLabel: 'Decatur, IL', neighborhood: 'downtown-decatur', neighborhoodLabel: 'Downtown Decatur' },
  { city: 'decatur', cityLabel: 'Decatur, IL', neighborhood: 'pershing-road',    neighborhoodLabel: 'Pershing Road' },
  // ── DEKALB ──
  { city: 'dekalb', cityLabel: 'DeKalb, IL', neighborhood: 'downtown-dekalb', neighborhoodLabel: 'Downtown DeKalb' },
  { city: 'dekalb', cityLabel: 'DeKalb, IL', neighborhood: 'lincoln-hwy',     neighborhoodLabel: 'Lincoln Hwy' },
  // ── GARY ──
  { city: 'gary', cityLabel: 'Gary, IN', neighborhood: 'downtown-gary', neighborhoodLabel: 'Downtown Gary' },
  { city: 'gary', cityLabel: 'Gary, IN', neighborhood: 'broadway',      neighborhoodLabel: 'Broadway' },
  { city: 'gary', cityLabel: 'Gary, IN', neighborhood: 'miller-beach',  neighborhoodLabel: 'Miller Beach' },
  // ── EAST CHICAGO ──
  { city: 'east-chicago', cityLabel: 'East Chicago, IN', neighborhood: 'indiana-harbor', neighborhoodLabel: 'Indiana Harbor' },
  { city: 'east-chicago', cityLabel: 'East Chicago, IN', neighborhood: 'main-street',    neighborhoodLabel: 'Main Street' },
  // ── HAMMOND ──
  { city: 'hammond', cityLabel: 'Hammond, IN', neighborhood: 'downtown-hammond', neighborhoodLabel: 'Downtown Hammond' },
  { city: 'hammond', cityLabel: 'Hammond, IN', neighborhood: 'calumet-ave',      neighborhoodLabel: 'Calumet Ave' },
  // ── INDIANAPOLIS ──
  { city: 'indianapolis', cityLabel: 'Indianapolis, IN', neighborhood: 'fountain-square',   neighborhoodLabel: 'Fountain Square' },
  { city: 'indianapolis', cityLabel: 'Indianapolis, IN', neighborhood: 'near-eastside',     neighborhoodLabel: 'Near Eastside' },
  { city: 'indianapolis', cityLabel: 'Indianapolis, IN', neighborhood: 'irvington',         neighborhoodLabel: 'Irvington' },
  { city: 'indianapolis', cityLabel: 'Indianapolis, IN', neighborhood: 'broad-ripple',      neighborhoodLabel: 'Broad Ripple' },
  { city: 'indianapolis', cityLabel: 'Indianapolis, IN', neighborhood: 'massachusetts-ave', neighborhoodLabel: 'Massachusetts Ave' },
  // ── FORT WAYNE ──
  { city: 'fort-wayne', cityLabel: 'Fort Wayne, IN', neighborhood: 'downtown-fort-wayne', neighborhoodLabel: 'Downtown Fort Wayne' },
  { city: 'fort-wayne', cityLabel: 'Fort Wayne, IN', neighborhood: 'south-side',          neighborhoodLabel: 'South Side' },
  { city: 'fort-wayne', cityLabel: 'Fort Wayne, IN', neighborhood: 'waynedale',           neighborhoodLabel: 'Waynedale' },
  // ── SOUTH BEND ──
  { city: 'south-bend', cityLabel: 'South Bend, IN', neighborhood: 'downtown-south-bend', neighborhoodLabel: 'Downtown South Bend' },
  { city: 'south-bend', cityLabel: 'South Bend, IN', neighborhood: 'near-southwest',      neighborhoodLabel: 'Near Southwest' },
  { city: 'south-bend', cityLabel: 'South Bend, IN', neighborhood: 'west-side',           neighborhoodLabel: 'West Side' },
  // ── VALPARAISO ──
  { city: 'valparaiso', cityLabel: 'Valparaiso, IN', neighborhood: 'downtown-valparaiso', neighborhoodLabel: 'Downtown Valparaiso' },
  { city: 'valparaiso', cityLabel: 'Valparaiso, IN', neighborhood: 'lincolnway',          neighborhoodLabel: 'Lincolnway' },
  // ── EVANSVILLE ──
  { city: 'evansville', cityLabel: 'Evansville, IN', neighborhood: 'downtown-evansville', neighborhoodLabel: 'Downtown Evansville' },
  { city: 'evansville', cityLabel: 'Evansville, IN', neighborhood: 'haynie-corner',       neighborhoodLabel: 'Haynie Corner' },
  // ── BLOOMINGTON IN ──
  { city: 'bloomington-in', cityLabel: 'Bloomington, IN', neighborhood: 'downtown-bloomington', neighborhoodLabel: 'Downtown Bloomington' },
  { city: 'bloomington-in', cityLabel: 'Bloomington, IN', neighborhood: 'kirkwood-ave',         neighborhoodLabel: 'Kirkwood Ave' },
  // ── TERRE HAUTE ──
  { city: 'terre-haute', cityLabel: 'Terre Haute, IN', neighborhood: 'downtown-terre-haute', neighborhoodLabel: 'Downtown Terre Haute' },
  { city: 'terre-haute', cityLabel: 'Terre Haute, IN', neighborhood: 'wabash-ave',           neighborhoodLabel: 'Wabash Ave' },
  // ── LAFAYETTE ──
  { city: 'lafayette', cityLabel: 'Lafayette, IN', neighborhood: 'downtown-lafayette', neighborhoodLabel: 'Downtown Lafayette' },
  { city: 'lafayette', cityLabel: 'Lafayette, IN', neighborhood: 'south-street',       neighborhoodLabel: 'South Street' },
  // ── MUNCIE ──
  { city: 'muncie', cityLabel: 'Muncie, IN', neighborhood: 'downtown-muncie', neighborhoodLabel: 'Downtown Muncie' },
  { city: 'muncie', cityLabel: 'Muncie, IN', neighborhood: 'mcgalliard-rd',   neighborhoodLabel: 'McGalliard Rd' },
  // ── MICHIGAN CITY ──
  { city: 'michigan-city', cityLabel: 'Michigan City, IN', neighborhood: 'downtown',     neighborhoodLabel: 'Downtown' },
  { city: 'michigan-city', cityLabel: 'Michigan City, IN', neighborhood: 'dunes-highway', neighborhoodLabel: 'Dunes Highway' },
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const secret = req.headers['x-api-secret'];
  if (secret !== process.env.NOTIFY_API_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const startAt = parseInt(req.query.startAt || '0', 10);
  const BATCH = 8; // process 8 neighborhoods per call (stays under 60s)
  const endAt = Math.min(startAt + BATCH, ALL_PAIRS.length);
  const batch = ALL_PAIRS.slice(startAt, endAt);

  const results = [];
  for (const pair of batch) {
    try {
      const r = await scoutNeighborhood(pair.city, pair.cityLabel, pair.neighborhood, pair.neighborhoodLabel, db);
      results.push({ ...pair, ...r, status: 'ok' });
    } catch (err) {
      results.push({ ...pair, status: 'error', error: err.message });
    }
    await delay(300);
  }

  const done = endAt >= ALL_PAIRS.length;
  return res.status(200).json({
    success: true,
    processed: batch.length,
    total: ALL_PAIRS.length,
    startAt,
    endAt,
    nextStartAt: done ? null : endAt,
    done,
    results,
  });
}
```

- [ ] **Step 2: Deploy and run the first batch**

```bash
git add api/admin/seed-directory.js
git commit -m "feat: add seed-directory endpoint with all 93 pairs"
git push origin main
```

Wait ~60s for deploy, then:
```bash
curl -s -X POST "https://sabor-api.vercel.app/api/admin/seed-directory?startAt=0" \
  -H "X-API-Secret: sabor_notify_2026_secret" \
  -H "Content-Type: application/json" | jq '{done, nextStartAt, processed, total}'
```
Expected: `{ "done": false, "nextStartAt": 8, "processed": 8, "total": 93 }`

- [ ] **Step 3: Run all batches until done**

Re-run with the returned `nextStartAt` until `done: true`. Each call takes ~30s:
```bash
# Run repeatedly, incrementing startAt by the returned nextStartAt each time:
# startAt=8, startAt=16, startAt=24 ... until done:true
curl -s -X POST "https://sabor-api.vercel.app/api/admin/seed-directory?startAt=8" \
  -H "X-API-Secret: sabor_notify_2026_secret" | jq '{done, nextStartAt, processed}'
```

- [ ] **Step 4: Verify the directory is live**

Open https://saboreats.com/directory/chicago/pilsen in a browser. Expected: spot cards with restaurant names, photos, ratings — no more "Scouting in progress" message.

---

## Task 4: Cron Schedule (`vercel.json`)

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Read the current vercel.json**

```bash
cat /Users/immaculateentertainment/Desktop/Sabor_Main/sabor-api/vercel.json
```

- [ ] **Step 2: Add Chicago neighborhood crons (weekly Sunday) + non-Chicago city crons (monthly)**

Append inside the `"crons"` array. Chicago crons run every Sunday at 13:00–15:00 UTC (staggered 5 min). Non-Chicago cities run once monthly (day of month = city index):

```json
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=pilsen",             "schedule": "0 13 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=little-village",     "schedule": "5 13 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=humboldt-park",      "schedule": "10 13 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=east-garfield-park", "schedule": "15 13 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=west-garfield-park", "schedule": "20 13 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=back-of-the-yards",  "schedule": "25 13 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=brighton-park",      "schedule": "30 13 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=gage-park",          "schedule": "35 13 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=logan-square",       "schedule": "40 13 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=avondale",           "schedule": "45 13 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=wicker-park",        "schedule": "50 13 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=albany-park",        "schedule": "55 13 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=uptown",             "schedule": "0 14 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=lakeview",           "schedule": "5 14 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=lincoln-park",       "schedule": "10 14 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=rogers-park",        "schedule": "15 14 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=bridgeport",         "schedule": "20 14 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=chinatown",          "schedule": "25 14 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=bronzeville",        "schedule": "30 14 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=hyde-park",          "schedule": "35 14 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=west-loop",          "schedule": "40 14 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=west-town",          "schedule": "45 14 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=river-north",        "schedule": "50 14 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=cicero",             "schedule": "55 14 * * 0" },
{ "path": "/api/admin/scout-directory?city=chicago&neighborhood=berwyn",             "schedule": "0 15 * * 0" },
{ "path": "/api/admin/scout-directory?city=aurora&neighborhood=downtown-aurora",     "schedule": "0 13 1 * *" },
{ "path": "/api/admin/scout-directory?city=joliet&neighborhood=downtown-joliet",     "schedule": "0 13 2 * *" },
{ "path": "/api/admin/scout-directory?city=elgin&neighborhood=downtown-elgin",       "schedule": "0 13 3 * *" },
{ "path": "/api/admin/scout-directory?city=waukegan&neighborhood=downtown-waukegan", "schedule": "0 13 4 * *" },
{ "path": "/api/admin/scout-directory?city=cicero&neighborhood=cermak-road",         "schedule": "0 13 5 * *" },
{ "path": "/api/admin/scout-directory?city=berwyn&neighborhood=cermak-road",         "schedule": "0 13 6 * *" },
{ "path": "/api/admin/scout-directory?city=indianapolis&neighborhood=fountain-square","schedule": "0 13 7 * *" },
{ "path": "/api/admin/scout-directory?city=east-chicago&neighborhood=indiana-harbor","schedule": "0 13 8 * *" },
{ "path": "/api/admin/scout-directory?city=hammond&neighborhood=downtown-hammond",   "schedule": "0 13 9 * *" },
{ "path": "/api/admin/scout-directory?city=gary&neighborhood=broadway",              "schedule": "0 13 10 * *" }
```

- [ ] **Step 3: Commit and deploy**

```bash
git add vercel.json
git commit -m "feat: add directory scout crons for Chicago (weekly) and top non-Chicago cities (monthly)"
git push origin main
```

- [ ] **Step 4: Verify crons appear in Vercel dashboard**

Open https://vercel.com/dashboard → sabor-api project → Settings → Crons.
Expected: new scout-directory entries visible with their schedules.

---

## Self-Review

**Spec coverage check:**
- ✅ Google Places Text Search → `searchPlaces()` in Task 1
- ✅ Claude Haiku descriptions → `generateDescriptions()` in Task 1
- ✅ Firestore upsert with merge:true → `scoutNeighborhood()` in Task 1
- ✅ Claimed spot protection → `isClaimed` check before update fields in Task 1
- ✅ CHICAGO_CENTROIDS + CITY_GEO fallback → Task 1
- ✅ `scout-directory.js` HTTP endpoint → Task 2
- ✅ Cron auth (X-API-Secret + Bearer CRON_SECRET) → Task 2
- ✅ `seed-directory.js` with startAt resume → Task 3
- ✅ ALL_PAIRS (all 93 city×neighborhood combos) → Task 3
- ✅ Vercel cron entries → Task 4
- ✅ No new env vars needed — confirmed in Task 1 (uses GOOGLE_PLACES_KEY, ANTHROPIC_API_KEY, FIREBASE_SERVICE_ACCOUNT, NOTIFY_API_SECRET, CRON_SECRET)

**Type consistency:**
- `scoutNeighborhood(citySlug, cityLabel, neighborhoodSlug, neighborhoodLabel, db)` — called identically in scout-directory.js and seed-directory.js ✅
- `toSlug()` exported from scout-core.js, not redefined elsewhere ✅
- `delay()` defined locally in seed-directory.js (not imported — different scope) ✅
