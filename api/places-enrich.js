// api/places-enrich.js — Google Places enrichment with geo-bias + bounding box validation

// Chicago center coordinates (50km bias radius)
const CITY_GEO = {
  'chicago': { lat: 41.8781, lng: -87.6298, radius: 50000 },
};

// Chicago bounding box for result validation
const CHICAGO_BOUNDS = { minLat: 41.6, maxLat: 42.1, minLng: -88.0, maxLng: -87.5 };

function getGeoBias(city) {
  const key = city.toLowerCase().split(',')[0].trim();
  return CITY_GEO[key] || CITY_GEO['chicago'];
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

    // Validate result is actually in Chicago metro (reject NYC etc)
    const lat = p.location?.latitude;
    const lng = p.location?.longitude;
    if (lat && lng) {
      const inChicago = lat >= CHICAGO_BOUNDS.minLat && lat <= CHICAGO_BOUNDS.maxLat
                     && lng >= CHICAGO_BOUNDS.minLng && lng <= CHICAGO_BOUNDS.maxLng;
      if (!inChicago) {
        console.log(`Rejected out-of-area result: ${name} at ${lat},${lng}`);
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
