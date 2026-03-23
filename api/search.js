import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Chicago neighborhood intelligence
const NEIGHBORHOOD_VIBES = {
  "Pilsen":           "murales, birria auténtica, arte chicano, taquerías familiares",
  "Little Village":   "al pastor, carnitas, La Villita, mercados, antojitos",
  "Humboldt Park":    "comida puertorriqueña, jibarito, pastelillos, La Paseo Boricua",
  "Logan Square":     "trendy fusion, craft cocktails, viral brunch, upscale dining",
  "Wicker Park":      "instagrammable spots, hipster vibes, great brunch, eclectic",
  "Back of the Yards":"mexicano old school, sin turistas, precios locales, auténtico",
  "Avondale":         "taquerías escondidas, mezcla polaco-mexicana, joyas ocultas",
  "Pilsen/Bridgeport":"gemas locales, bajo el radar, favoritos del barrio",
  "Bronzeville":      "soul food, Afro-Latino fusion, rich history, bold flavors",
  "South Chicago":    "mexicano tradicional, mariscos frescos, ambiente familiar",
  "West Town":        "emerging restaurants, young chefs, trending spots, creative",
  "Andersonville":    "international fusion, modern cuisine, cozy atmosphere",
};

// Tier radius config
const TIER_CONFIG = {
  free:    { radius: "1mi",     label: 'cerca de ti' },
  credits: { radius: "3mi",     label: "tu zona" },
  premium: { radius: "citywide",label: "todo Chicago" },
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


// Chicago ZIP → Neighborhood lookup table
const CHICAGO_NEIGHBORHOODS = {
  // Chicago proper
  '60601': 'The Loop', '60602': 'The Loop', '60603': 'The Loop',
  '60604': 'The Loop', '60605': 'South Loop', '60606': 'The Loop',
  '60607': 'West Loop', '60608': 'Pilsen', '60609': 'Back of the Yards',
  '60610': 'Near North Side', '60611': 'Streeterville', '60612': 'East Garfield Park',
  '60613': 'Lakeview', '60614': 'Lincoln Park', '60615': 'Woodlawn',
  '60616': 'Chinatown', '60617': 'South Chicago', '60618': 'Avondale',
  '60619': 'Chatham', '60620': 'Auburn Gresham', '60621': 'Englewood',
  '60622': 'Wicker Park', '60623': 'Little Village', '60624': 'Humboldt Park',
  '60625': 'Albany Park', '60626': 'Rogers Park', '60628': 'Roseland',
  '60629': 'Gage Park', '60630': 'Jefferson Park', '60631': 'Norwood Park',
  '60632': 'Back of the Yards', '60633': 'Hegewisch', '60634': 'Dunning',
  '60636': 'West Englewood', '60637': 'Hyde Park', '60638': 'Garfield Ridge',
  '60639': 'Belmont Cragin', '60640': 'Uptown', '60641': 'Hermosa',
  '60642': 'Noble Square', '60643': 'Beverly', '60644': 'Austin',
  '60645': 'West Ridge', '60646': 'Norwood Park', '60647': 'Logan Square',
  '60649': 'South Shore', '60651': 'Humboldt Park', '60652': 'Ashburn',
  '60653': 'Bronzeville', '60654': 'River North', '60655': 'Morgan Park',
  '60656': 'Norwood Park', '60657': 'Lakeview', '60659': 'West Ridge',
  '60660': 'Edgewater', '60661': 'West Loop', '60707': 'Elmwood Park',
  // Suburbs - show city name
  '60402': 'Berwyn', '60304': 'Oak Park', '60301': 'Oak Park',
  '60302': 'Oak Park', '60303': 'Oak Park', '60305': 'River Forest',
  '60130': 'Forest Park', '60153': 'Maywood', '60154': 'Westchester',
  '60155': 'Broadview', '60160': 'Melrose Park', '60163': 'Berkeley',
  '60164': 'Melrose Park', '60165': 'Stone Park', '60171': 'River Grove',
  '60176': 'Schiller Park', '60406': 'Blue Island', '60409': 'Calumet City',
  '60411': 'Chicago Heights', '60415': 'Chicago Ridge', '60419': 'Dolton',
  '60422': 'Flossmoor', '60425': 'Glenwood', '60426': 'Harvey',
  '60429': 'Hazel Crest', '60430': 'Homewood', '60438': 'Lansing',
  '60443': 'Matteson', '60445': 'Midlothian', '60452': 'Oak Forest',
  '60453': 'Oak Lawn', '60455': 'Bridgeview', '60456': 'Hometown',
  '60457': 'Hickory Hills', '60458': 'Justice', '60459': 'Burbank',
  '60461': 'Olympia Fields', '60462': 'Orland Park', '60463': 'Palos Heights',
  '60464': 'Palos Park', '60465': 'Palos Hills', '60466': 'Park Forest',
  '60469': 'Posen', '60471': 'Richton Park', '60472': 'Robbins',
  '60473': 'South Holland', '60475': 'Steger', '60476': 'Thornton',
  '60477': 'Tinley Park', '60478': 'Country Club Hills', '60480': 'Willow Springs',
  '60482': 'Worth', '60501': 'Summit', '60513': 'Brookfield',
  '60525': 'La Grange', '60526': 'La Grange Park', '60534': 'Lyons',
  '60546': 'Riverside', '60558': 'Western Springs', '60804': 'Cicero',
  '60827': 'Burnham',
};

function getNeighborhood(address) {
  if (!address) return null;
  // Extract ZIP code from address
  const zipMatch = address.match(/\b(\d{5})\b/);
  if (zipMatch) {
    const zip = zipMatch[1];
    if (CHICAGO_NEIGHBORHOODS[zip]) return CHICAGO_NEIGHBORHOODS[zip];
  }
  // Check for known suburb names in address
  const suburbs = ['Cicero', 'Berwyn', 'Oak Lawn', 'Oak Park', 'Evanston', 
    'Skokie', 'Niles', 'Norridge', 'Harwood Heights', 'Elmwood Park',
    'River Forest', 'Forest Park', 'Maywood', 'Bellwood', 'Melrose Park'];
  for (const suburb of suburbs) {
    if (address.includes(suburb)) return suburb;
  }
  return null;
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

  // Personalization
  const personalization = hasProfile
    ? `Perfil: ${profileContext}. Dieta: ${diets.join(", ") || "sin restricciones"}. Ambiente: ${vibes.join(", ") || "cualquiera"}.`
    : "Usuario nuevo — sugiere variedad representativa.";

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
    'troca','esquite','street vendor','street food','street corn'];
  const isStreetFood = streetFoodKeywords.some(k => query.toLowerCase().includes(k));
  const isLatinQuery = latinKeywords.some(k => query.toLowerCase().includes(k));
  const foodContext = isLatinQuery
    ? (language === 'en' ? 'Latin food specialist' : 'especialista en comida latina')
    : (language === 'en' ? 'general food discovery expert' : 'experto gastronómico general');

  // Check cache first (skip cache for street food - always fresh)
  const cacheKey = getCacheKey(query, city, tier, language, filterNeighborhood);
  const skipCache = isStreetFood || query.toLowerCase().includes('vendor') || query.toLowerCase().includes('truck');
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
      max_tokens: tier === 'premium' ? 900 : 500,
      messages: [
        {
          role: "user",
          content: language === 'en'
          ? `You are SABOR, a ${foodContext} in ${city}. ${query.toLowerCase().includes('plan my full food day') ? 'You are a personal food concierge. Create a detailed day itinerary with morning coffee or breakfast, lunch, afternoon snack, and dinner. Include real restaurant names, neighborhoods, dish recommendations with prices, and running total toward the budget. Keep total under the stated budget.' : isStreetFood ? `Find street vendors, food carts, and informal street food sellers ONLY for this specific search: "${query}". Results must match the exact type of street food being searched. NO restaurants, NO bakeries unless specifically searched. Include typical locations, neighborhoods, and days/hours they operate.` : isLatinQuery ? 'Find the best Latin restaurants for this search.' : 'Find the BEST restaurants for this search across ALL cuisines. Do NOT default to Latin food unless asked.'}

${neighborhoodContext}
${personalization}
${rotationNote}

Search: "${query}"

${seed}${trendingContext}

${tagInstruction}

Respond ONLY with valid JSON — no markdown, no backticks:
{
  "summary": "1-2 vibrant sentences in English${isPremium ? ", mention the neighborhood" : ""}",
  "neighborhood": "${currentNeighborhood || "Chicago"}",
  "results": [
    {
      "name": "Name — Exact Neighborhood",
      "emoji": "food emoji",
      "description": "2 authentic sentences about the spot — mention cuisine type and what makes it special",
      "tag": "appropriate tag based on tier",
      "distance": "0.0mi",
      "neighborhood": "neighborhood name"
    }
  ]
}

Critical rules:
- Exactly ${tier === 'premium' ? '6' : '3'} unique results
- ${rotationNote || "Vary the restaurants"}
- Respect radius ${tierConfig.radius}
- ${isPremium ? "Can recommend from any neighborhood in Chicago" : `Stay within ${tierConfig.radius} of the user`}
- Real authentic restaurants in Chicago
- Never repeat the same 3 spots`
          : `Eres SABOR, un ${foodContext} en ${city}. ${isStreetFood ? 'Encuentra vendedores ambulantes, carritos de comida, trocas de tacos y vendedores informales — NO restaurantes establecidos. Incluye sus ubicaciones típicas y barrios.' : isLatinQuery ? 'Encuentra los mejores restaurantes latinos para esta búsqueda.' : 'Encuentra los MEJORES restaurantes en TODAS las cocinas. NO te limites a comida latina a menos que se pida.'}

${neighborhoodContext}
${personalization}
${rotationNote}

Búsqueda: "${query}"

${tagInstruction}

Responde SOLO con JSON válido — sin markdown, sin backticks:
{
  "summary": "1-2 frases vibrantes en español/spanglish${isPremium ? ", menciona el barrio" : ""}",
  "neighborhood": "${currentNeighborhood || "Chicago"}",
  "results": [
    {
      "name": "Nombre — Barrio exacto",
      "emoji": "emoji de comida",
      "description": "2 frases auténticas sobre el spot — menciona el tipo de cocina y qué lo hace especial",
      "tag": "tag apropiado según tier",
      "distance": "0.0mi",
      "neighborhood": "nombre del barrio"
    }
  ]
}

Reglas críticas:
- Exactamente 3 resultados únicos
- ${rotationNote || "Varía los restaurantes"}
- Respeta radio ${tierConfig.radius}
- ${isPremium ? "Puedes recomendar de cualquier barrio de Chicago" : `Mantente dentro de ${tierConfig.radius} del usuario`}
- Restaurantes reales y auténticos de Chicago
- Nunca repitas los mismos 3 spots`,
        },
      ],
    });

    const raw = message.content[0].text.trim();
    const clean = raw.replace(/^```json\n?|^```\n?|\n?```$/g, "").trim();
    const parsed = JSON.parse(clean);
    setCache(cacheKey, parsed);
    // Enhance neighborhood data using lookup table
    if (parsed.results) {
      parsed.results = parsed.results.map(r => {
        if (r.address) {
          const verifiedHood = getNeighborhood(r.address);
          if (verifiedHood) r.neighborhood = verifiedHood;
        }
        return r;
      });
    }
    return res.status(200).json(parsed);
  } catch (err) {
    console.error("SABOR API error:", err);
    if (err instanceof SyntaxError)
      return res.status(500).json({ error: "AI response parse error" });
    return res.status(500).json({ error: "Search failed", message: err.message });
  }
}
