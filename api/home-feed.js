// api/home-feed.js — Home feed with caching, error handling, and fallback
import Anthropic from '@anthropic-ai/sdk';

const cache = new Map();
const CACHE_TTL = 300000; // 5 minutes

const SECTION_PROMPTS = {
  en_fuego:        'the most on-fire, buzzing, hottest right now restaurants',
  joyas_ocultas:   'the best hidden gem / under-the-radar local restaurants',
  subiendo_fuerte: 'the fastest rising, newest trending restaurants',
  nuevos_spots:    'the newest restaurant openings',
  los_mejores:     'the highest-rated, most acclaimed restaurants',
  tu_barrio:       'the best neighborhood, local-favorite restaurants',
  hot:             'the most on-fire, buzzing, hottest right now restaurants',
  gems:            'the best hidden gem / under-the-radar local restaurants',
  trending:        'the fastest rising, newest trending restaurants',
  new:             'the newest restaurant openings',
  rated:           'the highest-rated, most acclaimed restaurants',
  local:           'the best neighborhood, local-favorite restaurants',
};

// Fallback data when Claude is unavailable
const FALLBACK_RESTAURANTS = {
  chicago: [
    { name: 'Birrieria Zaragoza', cuisine: 'Mexican', emoji: '🌮', vibe: 'Authentic · Traditional' },
    { name: 'Mi Tocaya Antojería', cuisine: 'Mexican', emoji: '🔥', vibe: 'Trendy · Creative' },
    { name: 'S.K.Y.', cuisine: 'Asian Fusion', emoji: '✨', vibe: 'Upscale · Creative' },
  ],
};

// ─── Google Places enrichment (with geo-bias) ───
async function getPlaceDetails(name, city, apiKey) {
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.rating,places.userRatingCount,places.priceLevel,places.formattedAddress,places.currentOpeningHours,places.location,places.photos',
      },
      body: JSON.stringify({
        textQuery: `${name} restaurant ${city}`,
        maxResultCount: 1,
        locationBias: {
          circle: {
            center: { latitude: 41.8781, longitude: -87.6298 },
            radius: 50000,
          },
        },
      }),
    });

    const data = await response.json();
    const place = data.places?.[0];
    if (!place) return null;

    const priceMap = {
      'PRICE_LEVEL_INEXPENSIVE': '$',
      'PRICE_LEVEL_MODERATE': '$$',
      'PRICE_LEVEL_EXPENSIVE': '$$$',
      'PRICE_LEVEL_VERY_EXPENSIVE': '$$$$',
    };

    return {
      photo: place.photos?.[0]?.name
        ? `https://sabor-api.vercel.app/api/photo?ref=${encodeURIComponent(place.photos[0].name)}`
        : null,
      rating: place.rating ?? null,
      reviews: place.userRatingCount ?? null,
      price: priceMap[place.priceLevel] ?? null,
      address: place.formattedAddress ?? null,
      isOpen: place.currentOpeningHours?.openNow ?? null,
      latitude: place.location?.latitude ?? null,
      longitude: place.location?.longitude ?? null,
    };
  } catch (err) {
    console.error(`Places enrichment failed for "${name}":`, err.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300'); // CDN cache 5 min
  if (req.method === 'OPTIONS') return res.status(200).end();

  const city = req.query.city || 'Chicago';
  const section = req.query.section || 'en_fuego';
  const count = parseInt(req.query.count || '3', 10);

  // Check cache
  const key = `${city}:${section}:${count}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return res.status(200).json(hit.data);
  }

  const ak = process.env.ANTHROPIC_API_KEY;
  const pk = process.env.GOOGLE_PLACES_KEY;
  if (!ak) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  if (!pk) return res.status(500).json({ error: 'GOOGLE_PLACES_KEY not set' });

  const desc = SECTION_PROMPTS[section] || SECTION_PROMPTS.en_fuego;

  let restaurants;
  try {
    const anthropic = new Anthropic({ apiKey: ak });
    const exampleItems = Array.from({ length: count }, (_, i) =>
      `{"name":"Restaurant ${i + 1}","cuisine":"Cuisine","emoji":"🌮","vibe":"Vibe"}`
    ).join(',');

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `You are a local food expert for ${city}. Pick exactly ${count} real, distinct restaurants that are ${desc} in ${city}. Each must be a different restaurant. Respond ONLY with valid JSON, no markdown: {"restaurants":[${exampleItems}]}`,
      }],
    });

    const raw = msg.content[0].text.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Attempt JSON extraction
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    }

    if (!parsed?.restaurants?.length) throw new Error('Empty restaurant list');
    restaurants = parsed.restaurants;
  } catch (err) {
    console.error('Home feed Claude error:', err.message);
    // Use fallback data
    const cityKey = city.toLowerCase().split(',')[0].trim();
    restaurants = (FALLBACK_RESTAURANTS[cityKey] || FALLBACK_RESTAURANTS.chicago).slice(0, count);
  }

  // Enrich with Google Places
  const items = await Promise.all(
    restaurants.map(async (r) => ({
      name: r.name,
      displayName: r.name,
      cuisine: r.cuisine,
      emoji: r.emoji,
      vibe: r.vibe,
      places: await getPlaceDetails(r.name, city, pk),
    }))
  );

  const data = { items };
  cache.set(key, { ts: Date.now(), data });
  return res.status(200).json(data);
}
