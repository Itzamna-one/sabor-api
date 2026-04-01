// api/scout-events.js — AI Event Scout
// Uses Ticketmaster Discovery API with deep food-specific searches
// + Claude Haiku to curate the best food & drink events as SABOR picks.
// Stores in Firestore for the SABOR events feed.
//
// Triggered by:
// 1. Vercel Cron (daily at 6 AM CT → "0 12 * * *" UTC)
// 2. Manual POST with API_SECRET header

import Anthropic from '@anthropic-ai/sdk';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Firebase Admin
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── TICKETMASTER SEARCH ──
async function searchTicketmaster(keyword, city, apiKey, opts = {}) {
  try {
    const cityName = city.split(',')[0].trim();
    const today = new Date();
    const startDate = today.toISOString().split('.')[0] + 'Z';
    const endDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('.')[0] + 'Z';

    let url = `https://app.ticketmaster.com/discovery/v2/events.json?keyword=${encodeURIComponent(keyword)}&city=${encodeURIComponent(cityName)}&startDateTime=${startDate}&endDateTime=${endDate}&size=${opts.size || 15}&sort=date,asc&apikey=${apiKey}`;

    if (opts.classificationName) {
      url += `&classificationName=${encodeURIComponent(opts.classificationName)}`;
    }

    const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!resp.ok) {
      if (resp.status === 429) return { events: [], error: 'rate limited' };
      return { events: [], error: `${resp.status}` };
    }
    const data = await resp.json();
    return { events: data?._embedded?.events || [], error: null };
  } catch (err) {
    return { events: [], error: err.message };
  }
}

// ── COLLECT RAW EVENTS ──
async function collectEvents(city) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    return { events: [], debug: { error: 'TICKETMASTER_API_KEY not set' } };
  }

  // Deep food & drink search queries — way more specific than events.js
  const foodQueries = [
    { keyword: 'food festival', size: 15 },
    { keyword: 'food truck', size: 10 },
    { keyword: 'tasting dinner', size: 10 },
    { keyword: 'wine tasting', size: 10 },
    { keyword: 'beer festival', size: 10 },
    { keyword: 'brunch', size: 10 },
    { keyword: 'cooking class', size: 8 },
    { keyword: 'taco', size: 8 },
    { keyword: 'bbq barbecue', size: 8 },
    { keyword: 'cocktail', size: 8 },
    { keyword: 'chef dinner', size: 8 },
    { keyword: 'night market', size: 8 },
    { keyword: 'happy hour', size: 8 },
    { keyword: 'pizza', size: 8 },
    { keyword: 'seafood', size: 8 },
    { keyword: 'latin food mexican', size: 8 },
  ];

  // Also search broad categories that pair with food plans
  const broadQueries = [
    { keyword: 'festival', classificationName: 'miscellaneous', size: 10 },
    { keyword: 'food', classificationName: 'arts', size: 8 },
  ];

  const allQueries = [...foodQueries, ...broadQueries];
  const errors = [];
  const allEvents = [];

  // Run in batches of 4 (TM allows ~5 req/sec)
  for (let i = 0; i < allQueries.length; i += 4) {
    const batch = allQueries.slice(i, i + 4);
    const results = await Promise.all(
      batch.map(q => searchTicketmaster(q.keyword, city, apiKey, q))
    );
    for (const r of results) {
      allEvents.push(...r.events);
      if (r.error) errors.push(r.error);
    }
    // Small delay between batches
    if (i + 4 < allQueries.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Deduplicate by event ID
  const seen = new Set();
  const unique = allEvents.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  console.log(`🌐 ${allEvents.length} total → ${unique.length} unique events`);
  return {
    events: unique,
    debug: {
      queries: allQueries.length,
      totalResults: allEvents.length,
      uniqueResults: unique.length,
      errors: errors.slice(0, 3),
    },
  };
}

// ── FORMAT FOR CLAUDE ──
function formatForClaude(tmEvents, city) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  return tmEvents.map(e => {
    const venue = e._embedded?.venues?.[0] || {};
    const startLocal = e.dates?.start?.localDate || '';
    const startTime = e.dates?.start?.localTime || '';
    const priceMin = e.priceRanges?.[0]?.min;
    const priceMax = e.priceRanges?.[0]?.max;
    const priceStr = priceMin
      ? (priceMax && priceMax !== priceMin ? `$${priceMin}-$${priceMax}` : `$${priceMin}`)
      : 'See event';

    let dateStr = '';
    let timeStr = '';
    if (startLocal) {
      const d = new Date(startLocal + 'T' + (startTime || '00:00:00'));
      dateStr = `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
      if (startTime) {
        const [h, m] = startTime.split(':');
        const hour = parseInt(h);
        timeStr = `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
      }
    }

    const classification = e.classifications?.[0] || {};
    const segment = classification.segment?.name || '';
    const genre = classification.genre?.name || '';
    const subGenre = classification.subGenre?.name || '';

    return {
      title: e.name || '',
      description: (e.info || e.pleaseNote || '').substring(0, 300),
      venue: venue.name || 'TBA',
      address: venue.address?.line1 || '',
      city: venue.city?.name || city.split(',')[0].trim(),
      state: venue.state?.stateCode || '',
      date: dateStr,
      time: timeStr,
      price: priceStr,
      segment, genre, subGenre,
      url: e.url || '',
      image: e.images?.find(img => img.width >= 300)?.url || null,
    };
  });
}

// ── CLAUDE ENRICHMENT ──
async function enrichEvents(formattedEvents, city) {
  if (!formattedEvents.length) return [];

  const cityName = city.split(',')[0].trim();
  const today = new Date().toISOString().split('T')[0];

  // Split into chunks if too many (Claude works best with ~30 at a time)
  const chunks = [];
  for (let i = 0; i < formattedEvents.length; i += 30) {
    chunks.push(formattedEvents.slice(i, i + 30));
  }

  const allEnriched = [];

  for (const chunk of chunks) {
    const prompt = `You are a food event curator for SABOR, a food discovery app in ${cityName}. Today is ${today}.

From these ${chunk.length} Ticketmaster events, select ONLY the ones that are genuinely food or drink related. Be generous — if food or drink is a significant part of the event, include it.

INCLUDE:
- Food festivals, tastings, cook-offs, food truck events
- Wine/beer/cocktail/spirits tastings and festivals
- Brunch events, dinner shows, chef events
- Cooking classes, culinary experiences
- Events at restaurants, breweries, wineries, distilleries
- Cultural festivals where food is featured (Cinco de Mayo, etc.)
- BBQ competitions, pizza festivals, seafood boils
- Market events, night markets, pop-ups
- Any event where the venue or description clearly involves food/drink

EXCLUDE:
- Pure concerts/sports with no food angle
- Conferences, trade shows
- Events that already happened (before ${today})

For each selected event, enrich it with a food-focused description and classify it.

EVENTS:
${JSON.stringify(chunk, null, 2)}

Respond ONLY with a valid JSON array (no markdown, no backticks):
[
  {
    "title": "event title",
    "description": "1-2 sentences focusing on the FOOD/DRINK aspect",
    "venue": "venue name",
    "neighborhood": "neighborhood or area in ${cityName}",
    "date": "Day, Month Date",
    "time": "start time",
    "price": "price string",
    "category": "festival" | "tasting" | "brunch" | "class" | "food_truck" | "special" | "market" | "happy_hour" | "pop_up",
    "vibe": "Festival" | "Tasting" | "Brunch" | "Cooking Class" | "Food Trucks" | "Market" | "Happy Hour" | "Pop-Up" | "Food Event",
    "url": "event URL",
    "image": "image URL or null",
    "tags": ["relevant", "tags"],
    "confidence": "high" | "medium"
  }
]

Return [] if nothing qualifies as food/drink.`;

    try {
      const message = await claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const raw = message.content[0]?.text || '[]';
      let cleaned = raw.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      }
      const events = JSON.parse(cleaned);
      allEnriched.push(...events);
    } catch (err) {
      console.error('Claude enrichment chunk failed:', err.message);
    }
  }

  console.log(`🎯 Claude selected ${allEnriched.length} food events`);
  return allEnriched;
}

// ── FIRESTORE STORAGE ──
async function storeEvents(events, city) {
  if (!events.length) return 0;

  const collection = db.collection('sabor_events');
  const now = new Date();
  let stored = 0;

  const emojiMap = {
    'happy_hour': '🍹', 'festival': '🎉', 'pop_up': '🔥', 'tasting': '🍷',
    'brunch': '🥂', 'class': '👨‍🍳', 'food_truck': '🌮', 'special': '⭐', 'market': '🏪',
  };

  const batch = db.batch();

  for (const event of events) {
    if (!event.title || !event.venue) continue;

    const idBase = `${event.title}_${event.venue}`.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
    const docId = `scout_${idBase}`;

    const doc = {
      id: docId,
      title: event.title,
      description: event.description || '',
      venue: event.venue,
      neighborhood: event.neighborhood || city.split(',')[0].trim(),
      city,
      date: event.date || '',
      time: event.time || '',
      price: event.price || 'See venue',
      priceNum: parseInt(event.price?.replace(/[^0-9]/g, '')) || 0,
      category: event.category || 'special',
      vibe: event.vibe || 'Food Event',
      emoji: emojiMap[event.category] || '🍽️',
      image: event.image || null,
      premiumOnly: false,
      earlyAccess: false,
      tags: [...(event.tags || []), 'food', 'sabor', event.category].filter(Boolean),
      source: 'SABOR',
      url: event.url || null,
      recurring: false,
      confidence: event.confidence || 'medium',
      scoutedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };

    batch.set(collection.doc(docId), doc, { merge: true });
    stored++;
  }

  await batch.commit();
  console.log(`✅ Stored ${stored} SABOR events for ${city}`);
  return stored;
}

// ── CLEANUP EXPIRED ──
async function cleanupExpired() {
  const now = new Date().toISOString();
  const expired = await db.collection('sabor_events')
    .where('expiresAt', '<', now)
    .limit(50)
    .get();

  if (expired.empty) return 0;

  const batch = db.batch();
  expired.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  return expired.size;
}

// ── MAIN HANDLER ──
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, API_SECRET');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth
  const isCron = req.headers['x-vercel-cron'] === 'true';
  if (!isCron) {
    const secret = req.headers['api_secret'] || req.query?.secret;
    if (secret !== process.env.NOTIFY_API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const city = req.query?.city || req.body?.city || 'Chicago, IL';
  console.log(`🔍 Event Scout starting for ${city}`);

  try {
    // Step 1: Collect raw events from Ticketmaster
    const { events: rawEvents, debug } = await collectEvents(city);

    if (rawEvents.length === 0) {
      const cleaned = await cleanupExpired();
      return res.status(200).json({
        success: true, city, collected: 0, enriched: 0, stored: 0, cleaned,
        events: [], debug,
      });
    }

    // Step 2: Format for Claude
    const formatted = formatForClaude(rawEvents, city);

    // Step 3: Claude enrichment — picks best food events
    const enriched = await enrichEvents(formatted, city);

    // Step 4: Store in Firestore as SABOR picks
    const stored = await storeEvents(enriched, city);

    // Step 5: Cleanup expired
    const cleaned = await cleanupExpired();

    return res.status(200).json({
      success: true,
      city,
      collected: rawEvents.length,
      enriched: enriched.length,
      stored,
      cleaned,
      debug,
      events: enriched.map(e => ({
        title: e.title,
        venue: e.venue,
        date: e.date,
        category: e.category,
        neighborhood: e.neighborhood,
      })),
    });
  } catch (err) {
    console.error('Scout error:', err);
    return res.status(500).json({ error: 'Scout failed', message: err.message });
  }
}
