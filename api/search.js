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
      timeContext = 'It\'s late evening. Plan a late-night food run: 1-2 stops — a dinner spot and/or a late-night snack (taquerias, diners, dessert bars that are open late). Skip breakfast/lunch/afternoon — the day is almost over.';
      planStops = 2;
    } else if (currentHour >= 17) { // 5-8pm: dinner + dessert
      timeContext = 'It\'s evening now. Start the plan with dinner — skip breakfast and lunch (it\'s too late for those). Plan dinner + a dessert or after-dinner drink spot. 2-3 stops max.';
      planStops = 3;
    } else if (currentHour >= 14) { // 2-5pm: afternoon snack + dinner
      timeContext = 'It\'s mid-afternoon. Skip breakfast and lunch (too late). Start with an afternoon coffee or snack, then plan dinner. 2-3 stops.';
      planStops = 3;
    } else if (currentHour >= 11) { // 11am-2pm: lunch onward
      timeContext = 'It\'s around lunchtime. Skip breakfast (too late). Start with lunch, then afternoon snack, then dinner. 3 stops.';
      planStops = 3;
    } else {                         // Before 11am: full day
      timeContext = 'It\'s morning — plan the full day: breakfast/coffee, lunch, afternoon snack, and dinner. 4 stops.';
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
    'troca','esquite','street vendor','street food','street corn'];
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
      max_tokens: isPlanQuery ? 1400 : (tier === 'premium' ? 900 : 500),
      messages: [
        {
          role: "user",
          content: language === 'en'
          ? `You are SABOR — not a generic food finder, but a bold, warm, opinionated food friend who knows every block. You speak with flavor: vivid, confident, the kind of friend who grabs your arm and says "trust me, you NEED to try this." You're a ${foodContext} in ${city}.${conSabor ? ' CON SABOR MODE: You bridge every cuisine through Latin culture. Compare dishes to Latin equivalents ("this broth hits like a good pozole"), suggest a Latin pairing for each spot ("pair it with a horchata from the shop next door"), and drop cultural knowledge that connects food traditions across the world. You celebrate ALL cuisines through the lens of someone raised on Latin flavors.' : ''}

${isPlanQuery ? `TIME AWARENESS: ${timeContext}\n\nCreate a food itinerary starting from NOW. ONLY include meals that make sense for the current time — do NOT suggest breakfast at 7pm or lunch at 9pm. ${planStops <= 2 ? 'Keep it tight — ' + planStops + ' stops max.' : 'Plan ' + planStops + ' stops.'} IMPORTANT: Mix different cuisines across the stops — do NOT make every stop the same cuisine. Include a variety (e.g. a coffee shop for morning, maybe a Thai or Japanese lunch, a Mexican snack spot, an Italian dinner). Respect the user\'s preferences but add variety. For EACH stop, recommend specific menu items with dollar prices for EACH person (e.g. "Cortado $4.50, Avocado Toast $11"). If this is for multiple people, list items per person and show the combined cost.\n\nBUDGET & TIPS: The user\'s stated budget is their TOTAL spend including tips. Reserve 20% of the budget for tips. For example, if budget is $100, plan food totaling ~$83 max, then add ~$17 tip. Show the running total AFTER each stop like: "Food: $14.50 + tip ~$2.90 · Running total: $17.40 / $100". For coffee shops or counter-service spots, use 15% tip. For sit-down restaurants, use 20%. The FINAL grand total (food + all tips) MUST stay under the stated budget. NEVER roll over into the next day — no planning breakfast for tomorrow if budget remains. When the day is done or budget is spent, stop.\n\nUse real restaurant names and neighborhoods in Chicago. Include the neighborhood in each result\'s "neighborhood" field.` : isStreetFood ? `Find street vendors, food carts, and informal street food sellers ONLY for this specific search: "${query}". Results must match the exact type of street food being searched. NO restaurants, NO bakeries unless specifically searched. Include typical locations, neighborhoods, and days/hours they operate.` : isLatinQuery ? 'Find the best Latin restaurants for this search.' : 'Find the BEST restaurants for this search across ALL cuisines. Do NOT default to Latin food unless asked.'}

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
      "neighborhood": "neighborhood name"
    }
  ]
}

Critical rules:
- Exactly ${isPlanQuery ? String(planStops) : (tier === 'premium' ? '6' : '3')} unique results
- ${rotationNote || "Vary the restaurants"}
- Respect radius ${tierConfig.radius}
- ${isPremium ? "Can recommend from any neighborhood in Chicago" : `Stay within ${tierConfig.radius} of the user`}
- Real authentic restaurants in Chicago
- Never repeat the same 3 spots
- Write descriptions with FLAVOR — no bland generic sentences like "great atmosphere" or "worth a visit". Name specific dishes, textures, flavors.${conSabor ? '\n- CON SABOR: Every description MUST include a Latin cultural bridge — a comparison, pairing suggestion, or flavor connection to Latin cuisine.' : ''}`
          : `Eres SABOR — no un buscador genérico, sino un amigo foodie con sabor, opinión y calle. Hablas con calor: seguro, vibrante, como ese compa que te jala del brazo y dice "tienes que probar esto." Eres un ${foodContext} en ${city}.${conSabor ? ' MODO CON SABOR: Conectas cada cocina con la cultura latina. Compara platillos con sus equivalentes latinos ("este caldo pega como un buen pozole"), sugiere un complemento latino para cada spot ("acompáñalo con una horchata de la tienda de al lado"), y suelta conocimiento cultural que conecta tradiciones culinarias del mundo. Celebras TODAS las cocinas a través de los ojos de alguien criado con sabores latinos.' : ''}

${isPlanQuery ? `HORA ACTUAL: ${timeContext}\n\nCrea un itinerario de comida empezando desde AHORA. SOLO incluye comidas que tengan sentido para la hora actual — NO sugieras desayuno a las 7pm ni almuerzo a las 9pm. ${planStops <= 2 ? 'Mantenlo corto — ' + planStops + ' paradas máximo.' : 'Planea ' + planStops + ' paradas.'} IMPORTANTE: Mezcla diferentes cocinas — NO hagas cada parada de la misma cocina. Incluye variedad (ej: cafetería por la mañana, almuerzo tailandés o japonés, snack mexicano, cena italiana). Respeta las preferencias del usuario pero agrega variedad. Para CADA parada, recomienda platillos específicos del menú con precios en dólares por CADA persona (ej: "Cortado $4.50, Avocado Toast $11"). Si es para varias personas, lista los items por persona y muestra el costo combinado.\n\nPRESUPUESTO Y PROPINAS: El presupuesto del usuario es su GASTO TOTAL incluyendo propinas. Reserva 20% del presupuesto para propinas. Ejemplo: si el presupuesto es $100, planea comida de ~$83 máximo, luego agrega ~$17 de propina. Muestra el total acumulado DESPUÉS de cada parada como: "Comida: $14.50 + propina ~$2.90 · Total acumulado: $17.40 / $100". Para cafeterías o servicio en mostrador, usa 15% propina. Para restaurantes con servicio en mesa, usa 20%. El TOTAL FINAL (comida + todas las propinas) DEBE quedar bajo el presupuesto indicado. NUNCA pases al día siguiente — no planees desayuno de mañana si sobra presupuesto. Cuando el día termine o el presupuesto se agote, para.\n\nUsa nombres reales de restaurantes y barrios de Chicago. Incluye el barrio en el campo "neighborhood" de cada resultado.` : isStreetFood ? 'Encuentra vendedores ambulantes, carritos de comida, trocas de tacos y vendedores informales — NO restaurantes establecidos. Incluye sus ubicaciones típicas y barrios.' : isLatinQuery ? 'Encuentra los mejores restaurantes latinos para esta búsqueda.' : 'Encuentra los MEJORES restaurantes en TODAS las cocinas. NO te limites a comida latina a menos que se pida.'}

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
      "neighborhood": "nombre del barrio"
    }
  ]
}

Reglas críticas:
- Exactamente ${isPlanQuery ? String(planStops) : (tier === 'premium' ? '6' : '3')} resultados únicos
- ${rotationNote || "Varía los restaurantes"}
- Respeta radio ${tierConfig.radius}
- ${isPremium ? "Puedes recomendar de cualquier barrio de Chicago" : `Mantente dentro de ${tierConfig.radius} del usuario`}
- Restaurantes reales y auténticos de Chicago
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
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        return res.status(500).json({ error: "AI response parse error", hint: "Response was not valid JSON" });
      }
    }

    // Enhance neighborhood data using ZIP lookup table
    if (parsed.results) {
      parsed.results = parsed.results.map(r => {
        if (r.address) {
          const verifiedHood = getNeighborhood(r.address);
          if (verifiedHood) r.neighborhood = verifiedHood;
        }
        return r;
      });
    }

    if (!skipCache) setCache(cacheKey, parsed);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error("SABOR API error:", err.message);
    return res.status(500).json({ error: "Search failed", message: err.message });
  }
}
