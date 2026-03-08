import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Chicago neighborhood intelligence
const NEIGHBORHOOD_VIBES = {
  "Pilsen":           "murales, birria auténtica, arte chicano, taquerías familiares",
  "Little Village":   "al pastor, carnitas, La Villita, mercados, antojitos",
  "Humboldt Park":    "comida puertorriqueña, jibarito, pastelillos, La Paseo Boricua",
  "Logan Square":     "fusión latina trendy, cócteles craft, brunch viral, upscale",
  "Wicker Park":      "instagrammable, latin fusion, ambiente hipster, brunch",
  "Back of the Yards":"mexicano old school, sin turistas, precios locales, auténtico",
  "Avondale":         "taquerías escondidas, mezcla polaco-mexicana, joyas ocultas",
  "Pilsen/Bridgeport":"gemas locales, bajo el radar, favoritos del barrio",
  "Bronzeville":      "soul food latino, mezcla afro-latina, historia y sabor",
  "South Chicago":    "mexicano tradicional, mariscos frescos, ambiente familiar",
  "West Town":        "restaurantes emergentes, chefs latinos jóvenes, trending",
  "Andersonville":    "fusión internacional, latina moderna, ambiente acogedor",
};

// Tier radius config
const TIER_CONFIG = {
  free:    { radius: "1mi",     label: "cerca de ti" },
  credits: { radius: "3mi",     label: "tu zona" },
  premium: { radius: "citywide",label: "todo Chicago" },
};

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
  } = req.body;

  if (!query) return res.status(400).json({ error: "Query is required" });

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
    : `Tags: 🔥 viral, 📍 cerca de ti`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: `Eres SABOR, el AI de descubrimiento de comida latina más auténtico de ${city}.

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
      "description": "2 frases auténticas en español/spanglish sobre el spot",
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
    return res.status(200).json(parsed);
  } catch (err) {
    console.error("SABOR API error:", err);
    if (err instanceof SyntaxError)
      return res.status(500).json({ error: "AI response parse error" });
    return res.status(500).json({ error: "Search failed", message: err.message });
  }
}
