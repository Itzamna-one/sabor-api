// api/places-enrich.js
// POST { restaurants: [{name, cuisine}], city: "Chicago" }
// Returns each restaurant enriched with Google Places photo, rating, reviews, price, address

const GPLACES_KEY = process.env.GOOGLE_PLACES_KEY;
const PLACES_BASE = 'https://places.googleapis.com/v1';

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

  if (!searchRes.ok) return null;
  const data = await searchRes.json();
  const place = data.places?.[0];
  if (!place) return null;

  let photoUrl = null;
  if (place.photos?.length > 0) {
    const photoName = place.photos[0].name;
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { restaurants = [], city = 'Chicago' } = req.body ?? {};

  if (!GPLACES_KEY) return res.status(500).json({ error: 'GOOGLE_PLACES_KEY not configured' });
  if (!restaurants.length) return res.status(400).json({ error: 'No restaurants provided' });

  const enriched = await Promise.all(
    restaurants.map(async (r) => {
      const places = await googlePlacesSearch(r.name, city);
      return { ...r, places: places ?? null };
    })
  );

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({ enriched });
}
