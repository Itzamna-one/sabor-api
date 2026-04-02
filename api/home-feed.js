// api/home-feed.js — Home feed with caching, error handling, and fallback
import Anthropic from '@anthropic-ai/sdk';

const cache = new Map();
const CACHE_TTL = 300000; // 5 minutes

const SECTION_PROMPTS = {
  en_fuego:        'the most buzzing, talked-about restaurants in local neighborhoods right now — places people are discovering on social media and word of mouth. NOT Michelin-starred or nationally famous fine dining',
  joyas_ocultas:   'the best hidden gem / under-the-radar local restaurants that most people walk past — the kind of spot only neighborhood regulars know about. Must be $–$$ price range',
  subiendo_fuerte: 'the fastest rising, newest trending restaurants that locals are excited about — NOT already-famous places',
  nuevos_spots:    'the newest restaurant openings in the last few months that are worth checking out',
  los_mejores:     'the highest-rated neighborhood restaurants loved by locals — NOT nationally famous or Michelin-starred',
  tu_barrio:       'the best neighborhood, local-favorite restaurants — the places that define their barrio',
  hot:             'the most buzzing, talked-about restaurants in local neighborhoods right now — places people are discovering on social media and word of mouth. NOT Michelin-starred or nationally famous fine dining',
  gems:            'the best hidden gem / under-the-radar local restaurants that most people walk past — the kind of spot only neighborhood regulars know about. Must be $–$$ price range',
  trending:        'the fastest rising, newest trending restaurants that locals are excited about — NOT already-famous places',
  new:             'the newest restaurant openings in the last few months that are worth checking out',
  rated:           'the highest-rated neighborhood restaurants loved by locals — NOT nationally famous or Michelin-starred',
  local:           'the best neighborhood, local-favorite restaurants — the places that define their barrio',
};

// Fallback data when Claude is unavailable
const FALLBACK_RESTAURANTS = {
  chicago: [
    { name: 'Birrieria Zaragoza', cuisine: 'Mexican', emoji: '🌮', vibe: 'Authentic · Traditional' },
    { name: 'Mi Tocaya Antojería', cuisine: 'Mexican', emoji: '🔥', vibe: 'Trendy · Creative' },
    { name: 'S.K.Y.', cuisine: 'Asian Fusion', emoji: '✨', vibe: 'Upscale · Creative' },
  ],
  indianapolis: [
    { name: 'Tlaolli', cuisine: 'Mexican', emoji: '🌮', vibe: 'Authentic · Masa' },
    { name: 'Beholder', cuisine: 'American', emoji: '✨', vibe: 'Upscale · Creative' },
    { name: 'Livery', cuisine: 'Farm-to-Table', emoji: '🍷', vibe: 'Local · Seasonal' },
  ],
  rockford: [
    { name: 'Los Portales', cuisine: 'Mexican', emoji: '🌮', vibe: 'Family · Authentic' },
    { name: 'Olympic Tavern', cuisine: 'American', emoji: '🍔', vibe: 'Historic · Local' },
    { name: 'Octane Interlounge', cuisine: 'Fusion', emoji: '🔥', vibe: 'Trendy · Creative' },
  ],
};

// ─── City geo-coordinates for Places API bias ───
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
  'bloomington':    { lat: 40.4842, lng: -88.9937 },
  'decatur':        { lat: 39.8403, lng: -88.9548 },
  'dekalb':         { lat: 41.9295, lng: -88.7503 },
  'gary':           { lat: 41.5934, lng: -87.3464 },
  'east chicago':   { lat: 41.6392, lng: -87.4545 },
  'hammond':        { lat: 41.5834, lng: -87.5001 },
  'indianapolis':   { lat: 39.7684, lng: -86.1581 },
  'fort wayne':     { lat: 41.0793, lng: -85.1394 },
  'south bend':     { lat: 41.6764, lng: -86.2520 },
  'valparaiso':     { lat: 41.4731, lng: -87.0611 },
  'evansville':     { lat: 37.9716, lng: -87.5711 },
  'terre haute':    { lat: 39.4667, lng: -87.4139 },
  'lafayette':      { lat: 40.4167, lng: -86.8753 },
  'muncie':         { lat: 40.1934, lng: -85.3864 },
  'michigan city':  { lat: 41.7075, lng: -86.8950 },
};

function getCityGeo(city) {
  const cityKey = city.toLowerCase().split(',')[0].trim();
  return CITY_GEO[cityKey] || CITY_GEO['chicago']; // fallback to Chicago
}

// ─── Google Places enrichment (with geo-bias) ───
async function getPlaceDetails(name, city, apiKey, userLat, userLng) {
  try {
    // Use user's GPS if available, otherwise fall back to city center
    const geoCenter = (userLat && userLng)
      ? { latitude: userLat, longitude: userLng }
      : { latitude: getCityGeo(city).lat, longitude: getCityGeo(city).lng };
    // Tighter radius when we have user GPS (15km vs 50km)
    const geoRadius = (userLat && userLng) ? 15000 : 50000;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      signal: controller.signal,
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
            center: geoCenter,
            radius: geoRadius,
          },
        },
      }),
    });

    clearTimeout(timeout);
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

// ─── Neighborhood resolver (matches search.js) ───
function resolveNeighborhood(address) {
  if (!address) return null;
  const addr = address.toLowerCase();
  const zipMatch = addr.match(/\b(6\d{4}|460\d{2}|462\d{2}|463\d{2}|464\d{2})\b/);
  const zip = zipMatch ? zipMatch[1] : null;
  const numMatch = addr.match(/^(\d+)\s/);
  const streetNum = numMatch ? parseInt(numMatch[1]) : null;
  const s = addr;

  // Street-level disambiguation for major corridors
  if (streetNum && /\bpulaski\b/.test(s)) {
    if (streetNum >= 6300) return 'Chicago Lawn';
    if (streetNum >= 4300) return 'Archer Heights';
    if (streetNum >= 2200) return 'Little Village';
    if (streetNum >= 800) return 'North Lawndale';
    return 'Humboldt Park';
  }

  // ZIP-based resolution
  const ZIP_MAP = {
    '60608': () => /\bwentworth\b|\barcher\b/.test(s) ? 'Chinatown' : /\b3[1-5]/.test(s) ? 'Bridgeport' : 'Pilsen',
    '60616': () => /\bwentworth\b|\barcher\b/.test(s) ? 'Chinatown' : /\bking\b|\bcottage\b/.test(s) ? 'Bronzeville' : 'Bridgeport',
    '60623': () => 'Little Village',
    '60622': () => /\bmilwaukee\b|\bdamen\b/.test(s) ? 'Wicker Park' : /\bdivision\b/.test(s) ? 'Ukrainian Village' : 'West Town',
    '60647': () => /\bnorth\s+ave\b|\bdamen\b/.test(s) ? 'Bucktown' : 'Logan Square',
    '60607': () => 'West Loop',
    '60654': () => 'River North',
    '60614': () => 'Lincoln Park',
    '60657': () => /\bhalsted\b|\bbroadway\b/.test(s) ? 'Boystown' : 'Lakeview',
    '60613': () => 'Lakeview',
    '60640': () => /\bclark\b/.test(s) ? 'Andersonville' : 'Uptown',
    '60626': () => 'Rogers Park',
    '60659': () => 'Devon Ave',
    '60625': () => 'Albany Park',
    '60618': () => 'North Center',
    '60609': () => 'Back of the Yards',
    '60632': () => /\barcher\b/.test(s) ? 'Archer Heights' : 'Brighton Park',
    '60629': () => 'Chicago Lawn',
    '60636': () => 'West Englewood',
    '60615': () => 'Hyde Park',
    '60637': () => 'Hyde Park',
    '60624': () => /\bdivision\b|\bnorth\b/.test(s) ? 'Humboldt Park' : 'East Garfield Park',
    '60651': () => 'Humboldt Park',
    '60639': () => 'Belmont Cragin',
    '60641': () => /\birving\b/.test(s) ? 'Old Irving Park' : 'Portage Park',
    '60605': () => 'South Loop',
    '60601': () => 'The Loop', '60602': () => 'The Loop', '60603': () => 'The Loop', '60604': () => 'The Loop',
    '60611': () => 'Streeterville',
    '60660': () => 'Edgewater',
    '60653': () => 'Bronzeville',
    '60619': () => 'Chatham',
    '60620': () => 'Auburn Gresham',
    '60617': () => 'South Chicago',
    '60649': () => 'South Shore',
    '60621': () => 'Englewood',
    '60628': () => /\bpullman\b|\b111th\b/.test(s) ? 'Pullman' : 'Roseland',
    '60638': () => /\b63rd\b|\bcicero\b/.test(s) ? 'Clearing' : 'Garfield Ridge',
    '60652': () => 'Ashburn',
    '60655': () => 'Mount Greenwood',
    '60643': () => /\bwestern\b/.test(s) ? 'Beverly' : 'Morgan Park',
    '60644': () => 'Austin',
    '60612': () => /\bpulaski\b|\bkostner\b/.test(s) ? 'West Garfield Park' : 'Near West Side',
    '60630': () => 'Jefferson Park',
    '60634': () => 'Dunning',
    // Suburbs
    '60804': () => 'Cicero', '60805': () => 'Cicero',
    '60402': () => 'Berwyn',
    '60201': () => 'Evanston', '60202': () => 'Evanston',
    '60453': () => 'Oak Lawn', '60454': () => 'Oak Lawn',
    '60459': () => 'Burbank',
  };

  if (zip && ZIP_MAP[zip]) return ZIP_MAP[zip]();
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300'); // CDN cache 5 min
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Support both GET params and POST body for personalization
  let city, section, count, diets, cuisines, neighborhood, userLat, userLng;
  if (req.method === 'POST') {
    const body = req.body || {};
    city = body.city || 'Chicago';
    section = body.section || 'hot';
    count = parseInt(body.count || '6', 10);
    diets = body.diets || [];
    cuisines = body.cuisines || [];
    neighborhood = body.neighborhood || null;
    userLat = body.lat || null;
    userLng = body.lng || null;
  } else {
    city = req.query.city || 'Chicago';
    section = req.query.section || 'en_fuego';
    count = parseInt(req.query.count || '3', 10);
    diets = [];
    cuisines = [];
    neighborhood = null;
    userLat = null;
    userLng = null;
  }

  // Check cache (include neighborhood so location-aware results are cached separately)
  const dietKey = diets.length ? diets.sort().join(',') : 'none';
  const hoodKey = neighborhood || 'citywide';
  const key = `${city}:${section}:${count}:${dietKey}:${hoodKey}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return res.status(200).json(hit.data);
  }

  const ak = process.env.ANTHROPIC_API_KEY;
  const pk = process.env.GOOGLE_PLACES_KEY;
  if (!ak) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  if (!pk) return res.status(500).json({ error: 'GOOGLE_PLACES_KEY not set' });

  const desc = SECTION_PROMPTS[section] || SECTION_PROMPTS.hot;

  // Build personalization context
  const dietContext = diets.length
    ? `The user has these dietary preferences: ${diets.join(', ')}. At least 2 of your picks MUST accommodate these diets (vegan options, gluten-free menu, etc). Label which ones are diet-friendly in the vibe field.`
    : '';
  const cuisineContext = cuisines.length
    ? `The user enjoys ${cuisines.join(', ')} but wants to discover ALL types of food. Include at most 2 of their preferred cuisines — the rest MUST be different cuisines they haven't tried (soul food, BBQ, Chinese, Thai, Indian, Japanese, Italian, etc).`
    : '';
  const hoodContext = neighborhood
    ? `The user is currently in ${neighborhood}. AT LEAST HALF of your picks (${Math.ceil(count/2)} of ${count}) MUST be in or within 10 minutes of ${neighborhood}. The remaining picks can be from nearby neighborhoods. Do NOT scatter results across the entire city — this user wants spots near them.`
    : '';

  let restaurants;
  try {
    const anthropic = new Anthropic({ apiKey: ak });
    const exampleItems = Array.from({ length: count }, (_, i) =>
      `{"name":"Restaurant ${i + 1}","cuisine":"Cuisine","emoji":"🌮","vibe":"Vibe · $–$$"}`
    ).join(',');

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: `You are SABOR, a neighborhood food discovery app in ${city}. You find the spots that Google Maps and Yelp miss — the places only locals know. You recommend ALL cuisines (Mexican, Chinese, soul food, BBQ, Japanese, Italian, Indian, etc.) — not just Latin food. Diversity of cuisines is key.

Pick exactly ${count} real, distinct restaurants that are ${desc} in ${city}.

CRITICAL RULES:
- NO Michelin-starred restaurants (no Alinea, no Oriole, no Ever, no Smyth)
- NO chain restaurants or fast food (no Taco Bell, no McDonald's, no Chipotle, no Panda Express, no China Express, no Subway, no Popeyes, no Burger King, no Wendy's, no Chick-fil-A, no Portillo's, no Nando's)
- NO nationally famous restaurants
- Focus on NEIGHBORHOOD spots: independent, owner-operated, culturally rich
- Include a MIX of price points but lean toward accessible ($–$$)
- Each restaurant must be from a DIFFERENT neighborhood
- Include the neighborhood name in the vibe field (e.g. "Pilsen · Authentic · $")
- Prioritize places with character, story, or cultural significance
${dietContext}
${cuisineContext}
${hoodContext}

Respond ONLY with valid JSON, no markdown: {"restaurants":[${exampleItems}]}`,
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

  // Enrich with Google Places + resolve real neighborhoods
  const items = await Promise.all(
    restaurants.map(async (r) => {
      const places = await getPlaceDetails(r.name, city, pk, userLat, userLng);
      // Override Claude's guessed neighborhood with verified one from address
      const resolvedHood = places?.address ? resolveNeighborhood(places.address) : null;
      const vibe = resolvedHood
        ? r.vibe.replace(/^[^·]*·/, `${resolvedHood} ·`)  // replace first part of vibe with real hood
        : r.vibe;
      return {
        name: r.name,
        displayName: resolvedHood ? `${r.name} — ${resolvedHood}` : r.name,
        cuisine: r.cuisine,
        emoji: r.emoji,
        vibe: vibe,
        neighborhood: resolvedHood || null,
        places,
      };
    })
  );

  const data = { items };
  cache.set(key, { ts: Date.now(), data });
  return res.status(200).json(data);
}
