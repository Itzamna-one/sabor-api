import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Neighborhood intelligence — Illinois + Indiana
const NEIGHBORHOOD_VIBES = {
  // ── Chicago ──
  "Pilsen":           "murals, Mexican classics, art scene, family taquerías, trendy cafes",
  "Little Village":   "authentic Mexican, carnitas, La Villita markets, antojitos",
  "Humboldt Park":    "Puerto Rican cuisine, jibarito, pasteles, diverse eats",
  "Logan Square":     "trendy fusion, craft cocktails, viral brunch, upscale dining, Thai, ramen",
  "Wicker Park":      "instagrammable spots, diverse brunch, eclectic global cuisine, pizza",
  "Back of the Yards":"old school Mexican, no tourists, local prices, BBQ, soul food",
  "Avondale":         "hidden gems, Polish-Mexican mix, Korean, diverse neighborhood eats",
  "Bridgeport":       "local gems, Chinese, Italian, under the radar favorites",
  "Bronzeville":      "soul food, Afro-Caribbean, rich history, bold flavors, comfort food",
  "South Chicago":    "traditional Mexican, fresh seafood, family-style dining",
  "West Town":        "emerging restaurants, young chefs, trending spots, creative global cuisine",
  "Andersonville":    "international fusion, Swedish roots, modern cuisine, Middle Eastern, Ethiopian",
  "Chinatown":        "dim sum, Sichuan, Cantonese, BBQ, hot pot, bubble tea",
  "Lincoln Park":     "upscale dining, Italian, sushi, French bistros, brunch",
  "River North":      "steakhouses, sushi, rooftop bars, upscale global dining",
  "Uptown":           "Vietnamese pho, Ethiopian, diverse immigrant cuisines, affordable eats",
  "Devon Ave":        "Indian, Pakistani, Bangladeshi, South Asian street food, biryani",
  "Albany Park":      "Korean BBQ, Middle Eastern, Guatemalan, one of Chicago's most diverse food scenes",
  "Rogers Park":      "Jamaican, Mexican, Ethiopian, diverse student-area eats",
  "Hyde Park":        "soul food, Japanese, campus eats, Harold's Chicken, diverse cafes",
  "West Loop":        "Randolph Row, steakhouses, Greek Town, fine dining, chef-driven spots",
  "Lakeview":         "Thai, ramen, sports bars, diverse casual dining, brunch",
  // ── Chicago suburbs ──
  "Cicero":           "Little Mexico of the suburbs, Cermak Road taquerías, authentic antojitos",
  "Berwyn":           "Mexican-Czech mix, Cermak Road eats, Depot District bars",
  "Evanston":         "upscale brunch, diverse college-town dining, Middle Eastern",
  "Schaumburg":       "Indian, Korean, global mall dining, Golf Road corridor",
  // ── Illinois metro ──
  "Aurora":           "second-largest IL city, Latin main street, diverse east side",
  "Joliet":           "historic downtown, Mexican east side, diverse corridors",
  "Naperville":       "upscale dining, South Asian corridor, brunch scene",
  "Elgin":            "Latino heart of the Fox Valley, downtown taquerías, McLean Blvd corridor",
  "Waukegan":         "Mexican, Salvadoran, Latin corridor on Belvidere Rd",
  "Rockford":         "revitalized downtown, Broadway Latino eats, East State diversity",
  "Springfield":      "Route 66 classics, South Grand Asian strip, soul food",
  "Champaign":        "university town, Campustown Asian eats, diverse Green Street",
  // ── Indiana — NW Indiana (Chicagoland) ──
  "Gary":             "soul food, BBQ, lakefront casual, Broadway Mexican",
  "East Chicago":     "Indiana Harbor Mexican, authentic Latin corridor",
  "Hammond":          "Mexican, Salvadoran, Calumet Ave diversity, Hessville BBQ",
  "Valparaiso":       "charming downtown, local bistros, Route 30 diversity",
  // ── Indiana — major metros ──
  "Indianapolis":     "West Washington Latino heart, Fountain Square trendy, Mass Ave upscale, 38th St global",
  "Fort Wayne":       "revitalized downtown, South Side Mexican-Burmese, Lima Road diversity",
  "South Bend":       "west side Mexican, Eddy Street student eats, revitalized downtown",
};

// Tier radius config
const TIER_CONFIG = {
  free:    { radius: "1mi",     label: 'cerca de ti' },
  credits: { radius: "3mi",     label: "tu zona" },
  premium: { radius: "citywide",label: "toda la ciudad" },
};

// Simple in-memory cache
const searchCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCacheKey(query, city, tier, language, filterNeighborhood) {
  const normalized = query.toLowerCase()
    .replace(/\b(the|a|an|best|top|find|near|me|in|at)\b/g, '')
    .replace(/\s+/g, ' ').trim();
  const hood = filterNeighborhood ? filterNeighborhood.toLowerCase() : 'all';
  return `${normalized}|${city.split(',')[0].toLowerCase()}|${tier}|${language}|${hood}`;
}

function getCached(key) {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) { searchCache.delete(key); return null; }
  return entry.data;
}

function setCache(key, data) {
  if (searchCache.size >= 500) searchCache.delete(searchCache.keys().next().value);
  searchCache.set(key, { data, timestamp: Date.now() });
}


// ── Google Places name-based neighborhood verification ──
// The AI hallucinates addresses. Geocoding a fake address gives a fake neighborhood.
// Instead: look up the restaurant NAME in Google Places → get the REAL address + neighborhood.
// Same approach as places-enrich.js but focused on neighborhood correction.
const placeCache = new Map();
const PLACE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Geo-bias centers for Google Places lookups (matches home-feed.js + places-enrich.js)
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

function getSearchGeo(city) {
  const key = city.toLowerCase().split(',')[0].trim();
  return CITY_GEO[key] || CITY_GEO['chicago'];
}

// Detect street food / carts / trucks — these shouldn't have "restaurant" appended
const STREET_FOOD_KEYWORDS = /\b(cart|truck|stand|vendor|paletero|elotero|tamale|tamal|street food|food truck|pop-?up|market|mercado|feria|tianguis|puesto)\b/i;

async function lookupRealNeighborhood(name, city) {
  if (!name) return null;

  const cacheKey = `${name}|${city}`.toLowerCase();
  const cached = placeCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PLACE_CACHE_TTL) return cached.data;

  const apiKey = process.env.GOOGLE_PLACES_KEY;
  if (!apiKey) return null;

  try {
    // Strip "— Neighborhood" suffix from name if present (AI often adds it)
    const cleanName = name.replace(/\s*[—–-]\s*[A-Z][a-zA-Z\s]+$/, '').trim();
    const isStreet = STREET_FOOD_KEYWORDS.test(cleanName);
    const geo = getSearchGeo(city);

    // Try 1: search with appropriate suffix
    const suffix = isStreet ? '' : ' restaurant';
    let result = await _placesLookup(`${cleanName}${suffix} ${city}`, geo, apiKey, city);

    // Try 2: if no result, retry without suffix (catches non-standard business names)
    if (!result && !isStreet) {
      result = await _placesLookup(`${cleanName} ${city}`, geo, apiKey, city);
    }

    // Try 3: if still nothing, try just the name + "food" + city (broadest search)
    if (!result) {
      result = await _placesLookup(`${cleanName} food ${city}`, geo, apiKey, city);
    }

    placeCache.set(cacheKey, { data: result, ts: Date.now() });
    if (placeCache.size > 500) {
      const oldest = placeCache.keys().next().value;
      placeCache.delete(oldest);
    }
    return result;
  } catch (err) {
    console.error(`Places lookup failed for "${name}":`, err.message);
    return null;
  }
}

// Core Google Places Text Search call — extracted for retry logic
async function _placesLookup(textQuery, geo, apiKey, city) {
  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.formattedAddress,places.addressComponents,places.displayName',
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount: 1,
      locationBias: {
        circle: {
          center: { latitude: geo.lat, longitude: geo.lng },
          radius: 80000,
        },
      },
    }),
  });

  if (!resp.ok) return null;
  const data = await resp.json();
  const place = data.places?.[0];
  if (!place) return null;

  // Extract neighborhood from addressComponents
  let neighborhood = null;
  let realAddress = place.formattedAddress || null;
  const cityBase = city.toLowerCase().split(',')[0].trim();
  if (place.addressComponents) {
    const hoodComp = place.addressComponents.find(c =>
      c.types?.includes('neighborhood') || c.types?.includes('sublocality') || c.types?.includes('sublocality_level_1'));
    const localityComp = place.addressComponents.find(c => c.types?.includes('locality'));
    const locality = localityComp?.longText || null;
    // For major cities: use neighborhood component
    // For suburbs/smaller cities: use locality (city name)
    neighborhood = hoodComp?.longText || (locality && locality.toLowerCase() !== cityBase ? locality : null);
  }

  // Fallback: if no neighborhood from addressComponents, try to extract from formatted address
  // e.g. "1234 W Diversey Ave, Chicago, IL 60614" — can at least confirm the city
  if (!neighborhood && realAddress) {
    // Check if address is in a known neighborhood area via NEIGHBORHOOD_VIBES keys
    const addrLower = realAddress.toLowerCase();
    for (const hood of Object.keys(NEIGHBORHOOD_VIBES)) {
      if (addrLower.includes(hood.toLowerCase())) {
        neighborhood = hood;
        break;
      }
    }
  }

  if (!neighborhood && !realAddress) return null; // completely useless result
  return { neighborhood, address: realAddress };
}

// Verify all results in parallel — replace AI's guessed neighborhoods with Google's real data
async function verifyNeighborhoods(results, city) {
  if (!results || results.length === 0) return results;

  const promises = results.map(async (r) => {
    const realData = await lookupRealNeighborhood(r.name, city);
    if (realData) {
      if (realData.neighborhood) {
        if (realData.neighborhood !== r.neighborhood) {
          console.log(`🏘️ Neighborhood corrected: "${r.neighborhood}" → "${realData.neighborhood}" for ${r.name}`);
        }
        r.neighborhood = realData.neighborhood;
      } else {
        console.log(`🏘️ No neighborhood found for "${r.name}" — keeping AI's "${r.neighborhood}"`);
      }
      if (realData.address) {
        r.address = realData.address; // replace AI's hallucinated address with Google's real one
      }
    } else {
      console.log(`🏘️ Places lookup returned null for "${r.name}" — AI neighborhood "${r.neighborhood}" unchanged`);
    }
    return r;
  });

  return Promise.all(promises);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const {
    query,
    city = "Chicago, IL",
    tier = "free",
    cuisines = [],
    diets = [],
    vibes = [],
    profileContext = "Usuario nuevo",
    currentNeighborhood = null,
    favoriteNeighborhoods = [],
    filterNeighborhood = null,
    previousRestaurants = [],
    language = 'es',
    conSabor = false,
    localHour = null,
  } = req.body;

  if (!query) return res.status(400).json({ error: "Query is required" });

  // Fetch trending terms to boost relevant results
  let trendingContext = '';
  // Trends are supplementary - skip to avoid adding latency

  // Random seed to force variety in results
  const rotationSeeds = [
    'Focus on lesser-known spots that locals love but tourists miss.',
    'Prioritize spots that have been trending in the last 30 days.',
    'Focus on hidden gems with under 500 reviews but exceptional quality.',
    'Highlight spots from underrepresented neighborhoods.',
    'Focus on spots with the most unique or signature dishes.',
  ];
  const seed = rotationSeeds[Math.floor(Math.random() * rotationSeeds.length)];

  const tierConfig = TIER_CONFIG[tier] || TIER_CONFIG.free;
  const isPremium = tier === "premium";
  const hasCredits = tier === "credits";
  const hasProfile = cuisines.length > 0 || diets.length > 0 || vibes.length > 0;

  // Build neighborhood context
  let neighborhoodContext = "";
  if (isPremium && filterNeighborhood) {
    const vibe = NEIGHBORHOOD_VIBES[filterNeighborhood] || "";
    neighborhoodContext = `El usuario filtra por: ${filterNeighborhood} (conocido por: ${vibe}). Todos los resultados deben ser de este barrio.`;
  } else if (currentNeighborhood) {
    const vibe = NEIGHBORHOOD_VIBES[currentNeighborhood] || "";
    neighborhoodContext = `El usuario está en: ${currentNeighborhood} (${vibe}). Radio: ${tierConfig.radius}.`;
    if (isPremium && favoriteNeighborhoods.length > 0) {
      neighborhoodContext += ` Sus barrios favoritos: ${favoriteNeighborhoods.join(", ")}.`;
    }
  }

  // Rotation instruction
  const rotationNote = previousRestaurants.length > 0
    ? `NUNCA repitas estos restaurantes: ${previousRestaurants.join(", ")}.`
    : "";

  // Detect plan queries early (needed by personalization)
  const isPlanQuery = query.toLowerCase().includes('plan my full food day');

  // Time-aware planning — use client's local hour (phone knows real timezone)
  // Fall back to server UTC if client doesn't send it
  const currentHour = localHour != null ? parseInt(localHour) : new Date().getHours();
  // Determine remaining meals based on current time
  let timeContext = '';
  let planStops = 4;
  if (isPlanQuery) {
    if (currentHour >= 20) {        // 8pm+: late night only
      timeContext = `CURRENT TIME: ${currentHour}:00 (late evening). The user is planning NOW at night. ONLY plan dinner and/or late-night food — 1-2 stops maximum. DO NOT suggest breakfast, morning coffee, brunch, or lunch — those are IMPOSSIBLE at this hour. Use meal labels like "Dinner" or "Late Night", never "Morning" or "Lunch".`;
      planStops = 2;
    } else if (currentHour >= 17) { // 5-8pm: dinner + dessert
      timeContext = `CURRENT TIME: ${currentHour}:00 (evening). Plan dinner + dessert/drinks — 2-3 stops. DO NOT suggest breakfast or lunch — those are past. Use labels like "Dinner", "Dessert", "After-Dinner Drinks".`;
      planStops = 3;
    } else if (currentHour >= 14) { // 2-5pm: afternoon snack + dinner
      timeContext = `CURRENT TIME: ${currentHour}:00 (mid-afternoon). Skip breakfast and lunch (too late). Start with an afternoon coffee or snack, then plan dinner. 2-3 stops. Use labels like "Afternoon Snack", "Dinner".`;
      planStops = 3;
    } else if (currentHour >= 11) { // 11am-2pm: lunch onward
      timeContext = `CURRENT TIME: ${currentHour}:00 (around lunchtime). Skip breakfast (too late). Start with lunch, then afternoon snack, then dinner. 3 stops.`;
      planStops = 3;
    } else {                         // Before 11am: full day
      timeContext = `CURRENT TIME: ${currentHour}:00 (morning). Plan the full day: breakfast/coffee, lunch, afternoon snack, and dinner. 4 stops.`;
      planStops = 4;
    }
  }

  // Personalization
  const personalization = hasProfile
    ? (language === 'en'
      ? `User profile: ${profileContext}. Dietary needs: ${diets.join(", ") || "no restrictions"}. Preferred cuisines: ${cuisines.join(", ") || "open to all"}. Vibe: ${vibes.join(", ") || "any"}.${isPlanQuery ? ' IMPORTANT: All dish recommendations MUST respect these dietary preferences. Do not suggest dishes that conflict with the user\'s diet.' : ''}`
      : `Perfil: ${profileContext}. Dieta: ${diets.join(", ") || "sin restricciones"}. Cocinas preferidas: ${cuisines.join(", ") || "abierto a todo"}. Ambiente: ${vibes.join(", ") || "cualquiera"}.${isPlanQuery ? ' IMPORTANTE: Todas las recomendaciones de platillos DEBEN respetar estas preferencias dietéticas. No sugieras platillos que contradigan la dieta del usuario.' : ''}`)
    : (language === 'en' ? "New user — suggest representative variety." : "Usuario nuevo — sugiere variedad representativa.");

  // Tag logic
  const tagInstruction = isPremium
    ? `Tags disponibles: 🔥 viral, 💎 gema oculta, ⭐ Para ti (si coincide con perfil), 🏙️ [Barrio] exclusivo`
    : hasCredits
    ? `Tags disponibles: 🔥 viral, 💎 gema oculta, ⭐ Para ti (si coincide con perfil)`
    : `Tags: 🔥 viral, 📍 ${language === 'en' ? 'near you' : 'cerca de ti'}`;

  // Smart query classifier
  const latinKeywords = ['latin','latino','latina','mexican','taco','burrito',
    'colombian','cuban','puerto rican','dominican','salvadoran','peruvian',
    'argentinian','birria','pozole','tamale','enchilada','cubano','mofongo',
    'arepa','empanada','ceviche','mexicano','mexicana','colombiana','cubana',
    'tacos','burritos','pupusa','yuca','plantain','platano'];
  const streetFoodKeywords = ['taco truck','elote','elotero','tamalera','tamale vendor',
    'paletero','paleta','fruit cart','frutero','puesto','street taco','antojitos',
    'troca','esquite','street vendor','street food','street corn','food cart',
    'hot dog cart','corn man','raspado','raspados','churro cart','tamales lady',
    'food truck','lonchera','taquero','ambulante','vendedor','carrito'];
  const isStreetFood = streetFoodKeywords.some(k => query.toLowerCase().includes(k));
  const isLatinQuery = latinKeywords.some(k => query.toLowerCase().includes(k));
  const foodContext = isPlanQuery
    ? (language === 'en' ? 'personal food concierge covering ALL cuisines' : 'concierge personal de comida de TODAS las cocinas')
    : isLatinQuery
    ? (language === 'en' ? 'Latin food specialist' : 'especialista en comida latina')
    : (language === 'en' ? 'general food discovery expert' : 'experto gastronómico general');

  // Check cache first (skip cache for street food / vendor / similar - always fresh)
  const cacheKey = getCacheKey(query, city, tier, language, filterNeighborhood);
  const skipCache = isStreetFood
    || query.toLowerCase().includes('vendor')
    || query.toLowerCase().includes('truck')
    || query.toLowerCase().includes('similar to')
    || query.toLowerCase().includes('plan my');
  if (!skipCache) {
    const cached = getCached(cacheKey);
    if (cached) {
      console.log('Cache hit:', cacheKey);
      return res.status(200).json(cached);
    }
  }

  try {
    const message = await client.messages.create({
      model: tier === "premium" ? "claude-sonnet-4-20250514" : "claude-haiku-4-5-20251001",
      max_tokens: isPlanQuery ? 1400 : (tier === 'premium' ? 900 : 700),
      messages: [
        {
          role: "user",
          content: language === 'en'
          ? `You are SABOR — not a generic food finder, but a bold, warm, opinionated food friend who knows every block. You speak with flavor: vivid, confident, the kind of friend who grabs your arm and says "trust me, you NEED to try this." You're a ${foodContext} in ${city}.${conSabor ? ' CON SABOR MODE: You bridge every cuisine through Latin culture. Compare dishes to Latin equivalents ("this broth hits like a good pozole"), suggest a Latin pairing for each spot ("pair it with a horchata from the shop next door"), and drop cultural knowledge that connects food traditions across the world. You celebrate ALL cuisines through the lens of someone raised on Latin flavors.' : ''}

${isPlanQuery ? `TIME AWARENESS: ${timeContext}\n\nCreate a food itinerary starting from NOW. ONLY include meals that make sense for the current time — do NOT suggest breakfast at 7pm or lunch at 9pm. ${planStops <= 2 ? 'Keep it tight — ' + planStops + ' stops max.' : 'Plan ' + planStops + ' stops.'} IMPORTANT: Mix different cuisines across the stops — do NOT make every stop the same cuisine. Include a variety (e.g. a coffee shop for morning, maybe a Thai or Japanese lunch, a Mexican snack spot, an Italian dinner). Respect the user\'s preferences but add variety. For EACH stop, recommend specific menu items with dollar prices for EACH person (e.g. "Cortado $4.50, Avocado Toast $11"). If this is for multiple people, list items per person and show the combined cost.\n\nBUDGET & TIPS: The user\'s stated budget is their TOTAL spend including tips. Reserve 20% of the budget for tips. For example, if budget is $100, plan food totaling ~$83 max, then add ~$17 tip. Show the running total AFTER each stop like: "Food: $14.50 + tip ~$2.90 · Running total: $17.40 / $100". For coffee shops or counter-service spots, use 15% tip. For sit-down restaurants, use 20%. The FINAL grand total (food + all tips) MUST stay under the stated budget. NEVER roll over into the next day — no planning breakfast for tomorrow if budget remains. When the day is done or budget is spent, stop.\n\nUse real restaurant names and neighborhoods in Chicago. Include the neighborhood in each result\'s "neighborhood" field.` : isStreetFood ? `Find ONLY street vendors, food carts, taco trucks, and informal street food sellers for: "${query}".\n\nSTRICT RULES — what IS street food:\n- Taco trucks / trocas / loncheras parked on streets or in lots\n- Cart vendors (elote, tamale, paleta, fruit, hot dog carts)\n- Food trucks at regular spots or rotating locations\n- Informal stands or pop-ups (not in a building)\n\nWhat is NOT street food (NEVER include these):\n- Sit-down restaurants, even casual ones\n- Bakeries, cafes, or coffee shops\n- Fast food chains\n- Restaurants that serve street-style food indoors (e.g. a taquería with tables is a RESTAURANT, not street food)\n- Food halls or market stalls inside permanent buildings\n\nFor each result include: typical location (intersection, parking lot, or route), days/hours they usually operate, and the neighborhood. If you don\'t know exact hours, say "hours vary — check locally".` : isLatinQuery ? 'Find the best Latin restaurants for this search.' : 'Find the BEST restaurants for this search across ALL cuisines. Do NOT default to Latin food unless asked.'}

${neighborhoodContext}
${personalization}
${rotationNote}

Search: "${query}"

${seed}${trendingContext}

${tagInstruction}

Respond ONLY with valid JSON — no markdown, no backticks:
{
  "summary": "${isPlanQuery ? "1-2 bold sentences previewing the day plan with total budget — speak with personality, hype the journey" : `1-2 vibrant sentences with personality — be opinionated, name specific flavors or dishes that make this search exciting${isPremium ? ", mention the neighborhood vibe" : ""}`}",
  "neighborhood": "${currentNeighborhood || "Chicago"}",
  "results": [
    {
      "name": "Name — Exact Neighborhood",
      "emoji": "food emoji",
      "description": "${isPlanQuery ? "List dishes with prices: Cortado $4.50, Churro $3 · Food: $7.50 + tip $1.13 · Running total: $8.63 / $100" : conSabor ? "2 vivid sentences — describe the food with passion, then bridge it to Latin culture (compare flavors, suggest a Latin pairing, or connect food traditions). Be specific about dishes." : "2 vivid sentences about the spot — be opinionated, mention specific dishes and what makes them hit different. No generic praise."}",
      "tag": "appropriate tag based on tier",
      "distance": "0.0mi",
      "address": "full street address with ZIP (e.g. 1234 W 18th St, Chicago, IL 60608)",
      "neighborhood": "actual Chicago neighborhood name"
    }
  ]
}

Critical rules:
- Exactly ${isPlanQuery ? String(planStops) : (tier === 'premium' ? '6' : '3')} unique results${isPlanQuery ? `\n- TIME IS ${currentHour}:00 — ONLY use meal labels appropriate for this hour. After 5pm: "Dinner", "Late Night", "Dessert", "Drinks". NEVER use "Morning", "Breakfast", "Brunch", or "Lunch" after 5pm. NEVER use "Dinner" or "Late Night" before noon.` : ''}
- ${rotationNote || "Vary the restaurants"}
- Respect radius ${tierConfig.radius}
- ${isPremium ? "Can recommend from any neighborhood in Chicago" : `Stay within ${tierConfig.radius} of the user`}
- Real authentic restaurants in ${city} — must actually exist at the address you provide
- NEIGHBORHOOD ACCURACY: The "neighborhood" field MUST match where the restaurant physically is based on its street address. Do NOT guess — use the address. A spot on W 18th St between Halsted and Western is Pilsen. A spot on W Cermak near Wentworth is Chinatown. A spot on N Milwaukee near California is Logan Square. Diversey Ave near Western is Bucktown/Logan Square, NOT Chinatown. W Superior near Halsted is River West/West Town, NOT Little Village. If unsure, use the broader area (e.g. "West Side") rather than guessing wrong.
- The "address" field MUST be a real street address with ZIP code. Do NOT invent addresses.${isStreetFood ? '\n- STREET FOOD ONLY: Every result must be a mobile vendor, cart, truck, or informal stand. If it has indoor seating and a permanent address, it is a RESTAURANT — do not include it.' : ''}
- SPREAD restaurants across DIFFERENT neighborhoods — do NOT put all results in the same neighborhood unless the user specifically asked for one area
- Never repeat the same 3 spots
- Write descriptions with FLAVOR — no bland generic sentences like "great atmosphere" or "worth a visit". Name specific dishes, textures, flavors.${conSabor ? '\n- CON SABOR: Every description MUST include a Latin cultural bridge — a comparison, pairing suggestion, or flavor connection to Latin cuisine.' : ''}`
          : `Eres SABOR — no un buscador genérico, sino un amigo foodie con sabor, opinión y calle. Hablas con calor: seguro, vibrante, como ese compa que te jala del brazo y dice "tienes que probar esto." Eres un ${foodContext} en ${city}.${conSabor ? ' MODO CON SABOR: Conectas cada cocina con la cultura latina. Compara platillos con sus equivalentes latinos ("este caldo pega como un buen pozole"), sugiere un complemento latino para cada spot ("acompáñalo con una horchata de la tienda de al lado"), y suelta conocimiento cultural que conecta tradiciones culinarias del mundo. Celebras TODAS las cocinas a través de los ojos de alguien criado con sabores latinos.' : ''}

${isPlanQuery ? `HORA ACTUAL: ${timeContext}\n\nCrea un itinerario de comida empezando desde AHORA. SOLO incluye comidas que tengan sentido para la hora actual — NO sugieras desayuno a las 7pm ni almuerzo a las 9pm. ${planStops <= 2 ? 'Mantenlo corto — ' + planStops + ' paradas máximo.' : 'Planea ' + planStops + ' paradas.'} IMPORTANTE: Mezcla diferentes cocinas — NO hagas cada parada de la misma cocina. Incluye variedad (ej: cafetería por la mañana, almuerzo tailandés o japonés, snack mexicano, cena italiana). Respeta las preferencias del usuario pero agrega variedad. Para CADA parada, recomienda platillos específicos del menú con precios en dólares por CADA persona (ej: "Cortado $4.50, Avocado Toast $11"). Si es para varias personas, lista los items por persona y muestra el costo combinado.\n\nPRESUPUESTO Y PROPINAS: El presupuesto del usuario es su GASTO TOTAL incluyendo propinas. Reserva 20% del presupuesto para propinas. Ejemplo: si el presupuesto es $100, planea comida de ~$83 máximo, luego agrega ~$17 de propina. Muestra el total acumulado DESPUÉS de cada parada como: "Comida: $14.50 + propina ~$2.90 · Total acumulado: $17.40 / $100". Para cafeterías o servicio en mostrador, usa 15% propina. Para restaurantes con servicio en mesa, usa 20%. El TOTAL FINAL (comida + todas las propinas) DEBE quedar bajo el presupuesto indicado. NUNCA pases al día siguiente — no planees desayuno de mañana si sobra presupuesto. Cuando el día termine o el presupuesto se agote, para.\n\nUsa nombres reales de restaurantes y barrios de Chicago. Incluye el barrio en el campo "neighborhood" de cada resultado.` : isStreetFood ? `Encuentra SOLO vendedores ambulantes, carritos de comida, trocas y vendedores informales para: "${query}".\n\nREGLAS ESTRICTAS — qué SÍ es comida callejera:\n- Trocas / loncheras / taco trucks estacionados en calles o estacionamientos\n- Carritos (elote, tamales, paletas, fruta, hot dogs)\n- Food trucks en ubicaciones regulares o rotativas\n- Puestos informales o pop-ups (no en un edificio)\n\nQué NO es comida callejera (NUNCA incluyas estos):\n- Restaurantes con asientos, aunque sean casuales\n- Panaderías, cafeterías o coffee shops\n- Cadenas de fast food\n- Restaurantes que sirven comida estilo callejero pero adentro (una taquería con mesas es RESTAURANTE, no comida callejera)\n- Food halls o puestos dentro de edificios permanentes\n\nPara cada resultado incluye: ubicación típica (intersección, estacionamiento o ruta), días/horarios, y el barrio. Si no sabes horarios exactos, pon "horarios varían — confirma localmente".` : isLatinQuery ? 'Encuentra los mejores restaurantes latinos para esta búsqueda.' : 'Encuentra los MEJORES restaurantes en TODAS las cocinas. NO te limites a comida latina a menos que se pida.'}

${neighborhoodContext}
${personalization}
${rotationNote}

Búsqueda: "${query}"

${tagInstruction}

Responde SOLO con JSON válido — sin markdown, sin backticks:
{
  "summary": "${isPlanQuery ? "1-2 frases con personalidad previsualizando el plan del día con presupuesto — habla con sabor, emociona al usuario" : `1-2 frases vibrantes con opinión — sé directo, nombra sabores o platillos específicos que hagan esta búsqueda emocionante${isPremium ? ", menciona la vibra del barrio" : ""}`}",
  "neighborhood": "${currentNeighborhood || "Chicago"}",
  "results": [
    {
      "name": "Nombre — Barrio exacto",
      "emoji": "emoji de comida",
      "description": "${isPlanQuery ? "Lista platillos con precios: Cortado $4.50, Churro $3 · Comida: $7.50 + propina $1.13 · Total acumulado: $8.63 / $100" : conSabor ? "2 frases vividas — describe la comida con pasión, luego conéctala con la cultura latina (compara sabores, sugiere un complemento latino, o conecta tradiciones). Sé específico con los platillos." : "2 frases vividas sobre el spot — sé opinado, menciona platillos específicos y qué los hace únicos. Nada de elogios genéricos."}",
      "tag": "tag apropiado según tier",
      "distance": "0.0mi",
      "address": "dirección completa con ZIP (ej: 1234 W 18th St, Chicago, IL 60608)",
      "neighborhood": "nombre real del barrio de Chicago"
    }
  ]
}

Reglas críticas:
- Exactamente ${isPlanQuery ? String(planStops) : (tier === 'premium' ? '6' : '3')} resultados únicos${isPlanQuery ? `\n- SON LAS ${currentHour}:00 — SOLO usa etiquetas de comida apropiadas para esta hora. Después de las 5pm: "Cena", "Late Night", "Postre", "Drinks". NUNCA uses "Mañana", "Desayuno", "Brunch", o "Almuerzo" después de las 5pm. NUNCA uses "Cena" o "Late Night" antes del mediodía.` : ''}
- ${rotationNote || "Varía los restaurantes"}
- Respeta radio ${tierConfig.radius}
- ${isPremium ? "Puedes recomendar de cualquier barrio de " + city : `Mantente dentro de ${tierConfig.radius} del usuario`}
- Restaurantes reales y auténticos de ${city} — deben existir realmente en la dirección que proporcionas
- PRECISIÓN DE BARRIO: El campo "neighborhood" DEBE coincidir con donde el restaurante está físicamente SEGÚN SU DIRECCIÓN. NO adivines. Un spot en W 18th St entre Halsted y Western es Pilsen. Un spot en W Cermak cerca de Wentworth es Chinatown. Diversey cerca de Western es Bucktown/Logan Square, NO Chinatown. W Superior cerca de Halsted es River West/West Town, NO Little Village. Si no estás seguro, usa el área general (ej: "West Side").
- El campo "address" DEBE ser una dirección real con código postal. NO inventes direcciones.${isStreetFood ? '\n- SOLO COMIDA CALLEJERA: Cada resultado debe ser un vendedor móvil, carrito, troca o puesto informal. Si tiene asientos adentro y dirección permanente, es un RESTAURANTE — no lo incluyas.' : ''}
- DISTRIBUYE restaurantes en DIFERENTES barrios — NO pongas todos en el mismo barrio a menos que el usuario pida uno específico
- Nunca repitas los mismos 3 spots
- Escribe descripciones con SABOR — nada de frases genéricas como "gran ambiente" o "vale la pena". Nombra platillos, texturas, sabores específicos.${conSabor ? '\n- CON SABOR: Cada descripción DEBE incluir un puente cultural latino — una comparación, sugerencia de complemento, o conexión de sabores con la cocina latina.' : ''}`,
        },
      ],
    });

    const raw = message.content[0].text.trim();
    const clean = raw.replace(/^```json\n?|^```\n?|\n?```$/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      console.error("JSON parse failed. Raw AI response:", raw.substring(0, 500));
      // Attempt recovery: extract JSON object from response
      try {
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          return res.status(500).json({ error: "AI response parse error", hint: "Response was not valid JSON" });
        }
      } catch (recoveryErr) {
        console.error("JSON recovery also failed:", recoveryErr.message);
        return res.status(500).json({ error: "AI response parse error", hint: "Could not extract valid JSON from response" });
      }
    }

    // Verify neighborhoods via Google Places name lookup (parallel, cached)
    // Looks up each restaurant NAME in Google → gets REAL address + neighborhood
    // This fixes AI-hallucinated addresses AND neighborhoods in one shot
    if (parsed.results) {
      parsed.results = await verifyNeighborhoods(parsed.results, city);
    }

    if (!skipCache) setCache(cacheKey, parsed);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error("SABOR API error:", err.message, err.status || '', JSON.stringify(err.error || {}).substring(0, 300));
    return res.status(500).json({ error: "Search failed", message: err.message, status: err.status || null });
  }
}
