import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Simple in-memory cache — resets on cold start but saves calls during session
const cache = {};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const city = (req.query.city || 'Chicago, IL').trim();

  // Return cached result if available
  if (cache[city]) {
    return res.status(200).json({ city, neighborhoods: cache[city], cached: true });
  }

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: `You are a local food expert for Latino communities in the US.

Return the top 8-10 neighborhoods in "${city}" that are known for Latino food, restaurants, or culture.

Respond ONLY with a valid JSON array. No preamble, no markdown, no explanation.

Format:
[
  { "name": "neighborhood name", "emoji": "single relevant emoji", "vibe": "short 2-3 word vibe description" },
  ...
]

Rules:
- Only real neighborhoods in ${city}
- Emoji should reflect the food/culture vibe (e.g. 🌮 🎵 🌿 🔥 💎 🎨 🌊 🥩)
- Vibe should be punchy and food-relevant (e.g. "Tacos · Auténtico", "Trendy · Fusión", "Joyas Ocultas · Local")
- If the city has fewer than 8 notable Latino food neighborhoods, return what exists (minimum 4)
- Order by most well-known Latino food scene first`
        }
      ]
    });

    const raw = message.content[0].text.trim();

    // Strip any accidental markdown fences
    const clean = raw.replace(/```json|```/g, '').trim();
    const neighborhoods = JSON.parse(clean);

    // Validate structure
    if (!Array.isArray(neighborhoods)) throw new Error('Response is not an array');

    // Cache it
    cache[city] = neighborhoods;

    return res.status(200).json({ city, neighborhoods, cached: false });

  } catch (err) {
    console.error('Neighborhoods API error:', err);

    // Fallback — generic neighborhoods for unknown city
    const fallback = [
      { name: 'Centro Latino', emoji: '🌮', vibe: 'Auténtico · Local' },
      { name: 'Barrio Histórico', emoji: '🎨', vibe: 'Cultural · Raíces' },
      { name: 'El Mercado', emoji: '🔥', vibe: 'Viral · Trendy' },
      { name: 'La Colonia', emoji: '💎', vibe: 'Joyas Ocultas · Familiar' },
    ];

    return res.status(200).json({ city, neighborhoods: fallback, cached: false, fallback: true });
  }
}
