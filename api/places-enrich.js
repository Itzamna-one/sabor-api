// api/places-enrich.js — Google Places enrichment with geo-bias + bounding box validation

// City geo-bias centers + bounding boxes for result validation (IL/IN expansion)
const CITY_GEO = {
  'chicago':       { lat: 41.8781, lng: -87.6298, radius: 50000 },
  'aurora':        { lat: 41.7606, lng: -88.3201, radius: 30000 },
  'joliet':        { lat: 41.5250, lng: -88.0817, radius: 30000 },
  'naperville':    { lat: 41.7508, lng: -88.1535, radius: 25000 },
  'elgin':         { lat: 42.0354, lng: -88.2826, radius: 25000 },
  'waukegan':      { lat: 42.3636, lng: -87.8448, radius: 25000 },
  'cicero':        { lat: 41.8456, lng: -87.7539, radius: 15000 },
  'berwyn':        { lat: 41.8506, lng: -87.7937, radius: 15000 },
  'rockford':      { lat: 42.2711, lng: -89.0940, radius: 30000 },
  'springfield':   { lat: 39.7817, lng: -89.6501, radius: 30000 },
  'champaign':     { lat: 40.1164, lng: -88.2434, radius: 25000 },
  'evanston':      { lat: 42.0451, lng: -87.6877, radius: 15000 },
  'schaumburg':    { lat: 42.0334, lng: -88.0834, radius: 20000 },
  'indianapolis':  { lat: 39.7684, lng: -86.1581, radius: 50000 },
  'fort wayne':    { lat: 41.0793, lng: -85.1394, radius: 30000 },
  'south bend':    { lat: 41.6764, lng: -86.2520, radius: 25000 },
  'gary':          { lat: 41.5934, lng: -87.3464, radius: 25000 },
  'east chicago':  { lat: 41.6392, lng: -87.4545, radius: 15000 },
  'hammond':       { lat: 41.5834, lng: -87.5001, radius: 20000 },
  'valparaiso':    { lat: 41.4731, lng: -87.0611, radius: 20000 },
  'evansville':    { lat: 37.9716, lng: -87.5711, radius: 30000 },
  'terre haute':   { lat: 39.4667, lng: -87.4139, radius: 25000 },
};

function getGeoBias(city) {
  const key = city.toLowerCase().split(',')[0].trim();
  return CITY_GEO[key] || CITY_GEO['chicago'];
}

// Check if a coordinate is within a city's service area (geo-bias center + radius)
function isInServiceArea(lat, lng, city) {
  const geo = getGeoBias(city);
  const R = 6371000; // Earth radius in meters
  const dLat = (lat - geo.lat) * Math.PI / 180;
  const dLng = (lng - geo.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(geo.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return dist <= (geo.radius || 50000) * 1.5; // 1.5x buffer
}

async function getPlaceDetails(name, city, apiKey, isStreetFood = false) {
  try {
    const geo = getGeoBias(city);
    // For street food, don't append "restaurant" — it biases toward brick-and-mortar
    const searchSuffix = isStreetFood ? '' : ' restaurant';
    const textQuery = `${name}${searchSuffix} ${city}`;

    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.rating,places.userRatingCount,places.priceLevel,places.formattedAddress,places.addressComponents,places.currentOpeningHours,places.location,places.photos',
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: 1,
        locationBias: {
          circle: {
            center: { latitude: geo.lat, longitude: geo.lng },
            radius: geo.radius,
          },
        },
      }),
    });

    const d = await r.json();
    const p = d.places?.[0];
    if (!p) return null;

    const price = {
      'PRICE_LEVEL_INEXPENSIVE': '$',
      'PRICE_LEVEL_MODERATE': '$$',
      'PRICE_LEVEL_EXPENSIVE': '$$$',
      'PRICE_LEVEL_VERY_EXPENSIVE': '$$$$',
    };

    // Validate result is actually in the target city's service area (reject distant results)
    const lat = p.location?.latitude;
    const lng = p.location?.longitude;
    if (lat && lng) {
      if (!isInServiceArea(lat, lng, city)) {
        console.log(`Rejected out-of-area result: ${name} at ${lat},${lng} (city: ${city})`);
        return null;
      }
    }

    // Extract neighborhood from addressComponents
    let neighborhood = null;
    if (p.addressComponents) {
      const sublocalityComp = p.addressComponents.find(c =>
        c.types?.includes('sublocality') || c.types?.includes('sublocality_level_1') || c.types?.includes('neighborhood'));
      const localityComp = p.addressComponents.find(c => c.types?.includes('locality'));
      neighborhood = sublocalityComp?.longText || localityComp?.longText || null;
    }

    return {
      photo: p.photos?.[0]?.name ? `https://sabor-api.vercel.app/api/photo?ref=${encodeURIComponent(p.photos[0].name)}` : null,
      rating: p.rating ?? null,
      reviews: p.userRatingCount ?? null,
      price: price[p.priceLevel] ?? null,
      address: p.formattedAddress ?? null,
      neighborhood,
      isOpen: p.currentOpeningHours?.openNow ?? null,
      latitude: p.location?.latitude ?? null,
      longitude: p.location?.longitude ?? null,
    };
  } catch (e) {
    console.error(`Places enrichment failed for "${name}":`, e.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GOOGLE_PLACES_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GOOGLE_PLACES_KEY not set' });

  const { restaurants, city, isStreetFood = false } = req.body;
  if (!restaurants || !city) return res.status(400).json({ error: 'restaurants and city required' });

  const enriched = await Promise.all(
    restaurants.slice(0, 10).map(async (r) => {
      const name = r.name || r.n || '';
      return {
        name,
        places: name ? await getPlaceDetails(name, city, apiKey, isStreetFood) : null,
      };
    })
  );

  return res.status(200).json({ enriched });
}
