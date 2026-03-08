import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { query, city = "Chicago, IL", cuisines = [] } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are SABOR, a Latino food discovery AI for ${city}.
The user loves: ${cuisines.length > 0 ? cuisines.join(", ") : "all Latin cuisines"}.

User query: "${query}"

Respond ONLY with a valid JSON object — no markdown, no backticks, no explanation. Format:
{
  "summary": "1-2 sentence Spanish/Spanglish intro (warm, vibrant tone)",
  "results": [
    {
      "name": "Restaurant Name — Neighborhood",
      "emoji": "single food emoji",
      "description": "2 sentences in Spanish/Spanglish about vibe, specialty dish, why it's special",
      "tag": "🔥 23K vistas / 7 días  OR  💎 Gema oculta  OR  📍 0.8mi · Abierto ahora",
      "distance": "0.0mi"
    }
  ]
}

Rules:
- Always return exactly 3 results
- Results must feel authentic to ${city}'s Latino food scene
- Mix viral/trending spots with hidden gems
- Tags should feel real and specific
- Distance between 0.3mi and 3.5mi`,
        },
      ],
    });

    const raw = message.content[0].text.trim();

    // Strip markdown fences if model adds them
    const clean = raw.replace(/^```json\n?|^```\n?|\n?```$/g, "").trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("SABOR API error:", err);

    if (err instanceof SyntaxError) {
      return res.status(500).json({ error: "AI response parse error" });
    }

    return res.status(500).json({
      error: "Search failed",
      message: err.message,
    });
  }
}
