// api/home-feed.js
// GET /api/home-feed?city=Chicago&section=hot
// Claude picks 3 real restaurants → Google Places enriches with real photos + ratings

import Anthropic from '@anthropic-ai/sdk';

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const GPLACES_KEY = process.env.GOOGLE_PLACES_KEY;
const PLACES_BASE = 'https://places.googleapis.com/v1';

const SECTION_PROMPTS = {
  hot:      (city) => `Name exactly 3 Latino or Latin-fusion restaurants that are currently trending and viral in ${city}. Real places only.`,
  trending: (city) => `Name exactly 3 Latino restaurants rising fast in popularity right now in ${city}. Real places only.`,
  rated:    (city) => `Name exactly 3 of the highest-rated Latino restaurants in ${city}. Real places only.`,
  local:    (city) => `Name exactly 3 beloved neighborhood Latino restaurants in ${city} — not chains, local hidden gems. Real places only.`,
  gems:     (city) => `Name exactly 3 hidden-gem Latino restaurants in ${city} that locals love but tourists haven't found. Real places only.`,
  new:      (city) => `Name exactly 3 recently opened Latino restaurants in ${city} (last 12 months). Real places only.`,
};

async function claudePicks(city, section) {
  const prompt = (SECTION_PROMPTS[section] ?? SECTION_PROMPTS.hot)(city);
  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: `You are a local Latino food expert. Respond ONLY with a JSON array of exactly 3 objects.
Each object must have: "name" (restaurant name), "cuisine" (e.g. Mexican, Colombian, Cuban), "vibe" (1 short phrase, max 5 words).
No markdown, no explanation. Just the raw JSON array.`,
    messages: [{ role: 'user', content: prompt }],
  });
  const raw = msg.content[0].text.trim().replace(/```json|```/g, '');
  return JSON.parse(raw);
}

const PRICE_MAP = {
  PRICE_LEVEL_FREE: 'Free',
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

async function googlePlacesSearch(name, city) {
  const searchRes = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GPLACES_KEY,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.rating',
        'places.userRatingCount',
        'places.priceLevel',
        'places.formattedAddress',
        'places.photos',
        'places.currentOpeningHours',
        'places.location',
      ].join(','),
    },
    body: JSON.stringify({
      textQuery: `${name} restaurant ${city}`,
      maxResultCount: 1,
      languageCode: 'en',
    }),
  });

  if (!searchRes.ok) {
    console.error('Places search failed:', await searchRes.text());
    return null;
  }

  const data = await searchRes.json();
  const place = data.places?.[0];
  if (!place) return null;

  // Build photo URL — Google Places photo endpoint with API key
  let photoUrl = null;
  if (place.photos?.length > 0) {
    const photoName = place.photos[0].name; // e.g. "places/ChIJ.../photos/AXCi..."
    photoUrl = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&maxWidthPx=600&key=${GPLACES_KEY}`;
  }

  return {
    googlePlaceId: place.id,
    canonicalName: place.displayName?.text ?? name,
    photo:         photoUrl,
    rating:        place.rating ?? null,
    reviews:       place.userRatingCount ?? null,
    price:         PRICE_MAP[place.priceLevel] ?? null,
    address:       place.formattedAddress ?? null,
    latitude:      place.location?.latitude ?? null,
    longitude:     place.location?.longitude ?? null,
    isOpen:        place.currentOpeningHours?.openNow ?? null,
  };
}

// In-memory cache keyed by "city:section"
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export default async function handler(req, res) {
  const { city = 'Chicago', section = 'hot' } = req.query;

  const cacheKey = `${city.toLowerCase()}:${section}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    // Step 1: Claude picks 3 restaurants
    const picks = await claudePicks(city, section);

    // Step 2: Google Places enriches all 3 in parallel
    const enriched = await Promise.all(
      picks.map(async (p, i) => {
        const places = await googlePlacesSearch(p.name, city);
        return {
          rank:        i + 1,
          displayName: p.name,
          cuisine:     p.cuisine,
          vibe:        p.vibe,
          places,
        };
      })
    );

    const payload = {
      city,
      section,
      items: enriched,
      generatedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, { ts: Date.now(), data: payload });
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(payload);
  } catch (err) {
    console.error('home-feed error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
