// api/admin/scout-core.js
import Anthropic from '@anthropic-ai/sdk';

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
  'food_truck':                'Street Food',
  'meal_takeaway':             'Street Food',
  'meal_delivery':             'Street Food',
};

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

function deriveTags(cuisine, neighborhoodSlug, isTruck) {
  const tags = [cuisine.toLowerCase()];
  const latinNeighborhoods = ['pilsen','little-village','back-of-the-yards','gage-park','brighton-park','humboldt-park'];
  if (latinNeighborhoods.includes(neighborhoodSlug)) tags.push('authentic', 'community');
  if (cuisine === 'Mexican') tags.push('tacos');
  if (isTruck) tags.push('food truck', 'street food');
  return tags;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function searchPlaces(query, coords, apiKey) {
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.displayName,places.id,places.rating,places.userRatingCount,places.priceLevel,places.formattedAddress,places.location,places.photos,places.businessStatus,places.types,places.primaryType',
    },
    body: JSON.stringify({
      textQuery: query,
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

export async function scoutNeighborhood(citySlug, cityLabel, neighborhoodSlug, neighborhoodLabel, db) {
  const apiKey = process.env.GOOGLE_PLACES_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_KEY not set');

  const coords = getCoords(citySlug, neighborhoodSlug);
  const [restaurants, trucks] = await Promise.all([
    searchPlaces(`restaurant ${neighborhoodLabel} ${cityLabel}`, coords, apiKey),
    searchPlaces(`food truck taquero elotero ${neighborhoodLabel} ${cityLabel}`, coords, apiKey),
  ]);
  const seenIds = new Set();
  const places = [...restaurants, ...trucks].filter(p => {
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });

  const TRUCK_TYPES = new Set(['food_truck', 'meal_takeaway', 'meal_delivery']);
  const TRUCK_NAME_RE = /\b(food\s+truck|taco\s+truck|taco\s+cart|\btruck\b)/i;
  const VENDOR_NAME_RE = /\b(elotes?|elotero|tamale\s+(lady|man|cart|vendor)|tamalera|tamalero|cart\b)/i;
  const spots = places.map(p => {
    const types = p.types || [];
    const name = p.displayName?.text || '';
    const isTruck = types.some(t => TRUCK_TYPES.has(t)) || TRUCK_NAME_RE.test(name);
    const isVendor = !isTruck && VENDOR_NAME_RE.test(name);
    return {
      name,
      cuisine: getCuisine(types),
      isTruck,
      isVendor,
      address: p.formattedAddress || '',
      lat: p.location?.latitude ?? 0,
      lng: p.location?.longitude ?? 0,
      rating: p.rating ?? 0,
      reviewCount: p.userRatingCount ?? 0,
      priceLevel: { PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 }[p.priceLevel] ?? 1,
      photoUrl: p.photos?.[0]?.name
        ? `https://sabor-api.vercel.app/api/photo?ref=${encodeURIComponent(p.photos[0].name)}`
        : null,
    };
  }).filter(s => s.name);

  const descriptions = await generateDescriptions(spots, neighborhoodLabel, cityLabel);

  const now = new Date().toISOString();
  const collection = db.collection('directory_spots');

  // Build all doc IDs and filter out empty slugs
  const candidates = spots.map(spot => {
    const slug = toSlug(spot.name);
    const docId = slug ? `${citySlug}_${neighborhoodSlug}_${slug}` : null;
    return { spot, slug, docId };
  });

  const valid = candidates.filter(c => c.docId !== null);
  const skipped = candidates.length - valid.length;

  // Parallelize all existence checks
  const existingDocs = await Promise.all(
    valid.map(c => collection.doc(c.docId).get())
  );

  // Batch all writes
  const batch = db.batch();
  let upserted = 0;

  for (let i = 0; i < valid.length; i++) {
    const { spot, slug, docId } = valid[i];
    const existing = existingDocs[i];
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
      spotType: spot.isTruck ? 'truck' : spot.isVendor ? 'street_vendor' : 'restaurant',
      tags: deriveTags(spot.cuisine, neighborhoodSlug, spot.isTruck),
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

    batch.set(collection.doc(docId), update, { merge: true });
    upserted++;
  }

  await batch.commit();
  return { found: places.length, upserted, skipped };
}
