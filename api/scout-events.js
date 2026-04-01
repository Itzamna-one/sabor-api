// api/scout-events.js — AI Event Scout
// Uses Eventbrite API with deep food-specific queries + Claude Haiku enrichment.
// Stores curated SABOR food events in Firestore with TTL.
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

// ── CITY COORDS ──
const CITY_COORDS = {
  'chicago':       { lat: 41.8781, lng: -87.6298 },
  'indianapolis':  { lat: 39.7684, lng: -86.1581 },
  'aurora':        { lat: 41.7606, lng: -88.3201 },
  'naperville':    { lat: 41.7508, lng: -88.1535 },
  'joliet':        { lat: 41.5250, lng: -88.0817 },
  'rockford':      { lat: 42.2711, lng: -89.0940 },
  'gary':          { lat: 41.5934, lng: -87.3465 },
  'south bend':    { lat: 41.6764, lng: -86.2520 },
};

// ── FOOD SEARCH QUERIES ──
// Broader and more specific than the regular events.js searches.
// Rotates daily so we hit different keywords each run.
function getSearchQueries(dayOfWeek) {
  const allQueries = [
    // Core food events
    'food festival',
    'food truck',
    'night market',
    'pop up dinner',
    'tasting dinner',
    'supper club',
    'prix fixe',
    // Drink-focused
    'happy hour',
    'wine tasting',
    'beer tasting',
    'cocktail',
    'brewery dinner',
    'mezcal',
    'tequila tasting',
    // Specific cuisines
    'taco',
    'bbq',
    'brunch',
    'ramen',
    'sushi',
    'pizza',
    // Experience-based
    'cooking class',
    'chef dinner',
    'farm to table',
    'bottomless brunch',
    'drag brunch',
    'rooftop dining',
    // Cultural
    'latin food',
    'mexican food',
    'cultural food',
    'food and music',
    'street food',
    'night food',
  ];

  // Pick 10 queries per day, rotating through the list
  const startIdx = (dayOfWeek * 5) % allQueries.length;
  const queries = [];
  for (let i = 0; i < 10; i++) {
    queries.push(allQueries[(startIdx + i) % allQueries.length]);
  }
  return queries;
}

// ── EVENTBRITE API SEARCH ──
async function searchEventbrite(query, coords, token) {
  try {
    const url = `https://www.eventbriteapi.com/v3/events/search/?q=${encodeURIComponent(query)}&location.latitude=${coords.lat}&location.longitude=${coords.lng}&location.within=30mi&expand=venue&sort_by=date&page_size=10`;
    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      if (resp.status === 429) {
        console.warn(`Rate limited on query: ${query}`);
        return [];
      }
      console.error(`Eventbrite search "${query}": ${resp.status}`);
      return [];
    }
    const data = await resp.json();
    return data?.events || [];
  } catch (err) {
    console.error(`Eventbrite search failed "${query}":`, err.message);
    return [];
  }
}

// ── COLLECT RAW EVENTS ──
async function collectEvents(city) {
  const token = process.env.EVENTBRITE_API_TOKEN;
  if (!token) {
    console.error('EVENTBRITE_API_TOKEN not set');
    return [];
  }

  const cityName = city.split(',')[0].trim().toLowerCase();
  const coords = CITY_COORDS[cityName] || CITY_COORDS['chicago'];
  const dayOfWeek = new Date().getDay();
  const queries = getSearchQueries(dayOfWeek);

  console.log(`📋 Running ${queries.length} Eventbrite food searches`);

  // Run searches in batches of 3 to respect rate limits
  const allEvents = [];
  for (let i = 0; i < queries.length; i += 3) {
    const batch = queries.slice(i, i + 3);
    const results = await Promise.all(
      batch.map(q => searchEventbrite(q, coords, token))
    );
    allEvents.push(...results.flat());

    // Small delay between batches to avoid rate limits
    if (i + 3 < queries.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Deduplicate by event ID
  const seen = new Set();
  const unique = allEvents.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  console.log(`🌐 ${allEvents.length} total results → ${unique.length} unique events`);
  return unique;
}

// ── FORMAT FOR CLAUDE ──
function formatEventsForClaude(events) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  return events.map(e => {
    const venueName = e.venue?.name || 'TBA';
    const venueAddr = e.venue?.address?.localized_address_display || '';
    const venueCity = e.venue?.address?.city || '';
    const startLocal = e.start?.local || '';
    const endLocal = e.end?.local || '';
    const isFree = e.is_free || false;

    let dateStr = '';
    let timeStr = '';
    if (startLocal) {
      const d = new Date(startLocal);
      dateStr = `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
      const h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, '0');
      timeStr = `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
    }
    if (endLocal) {
      const d = new Date(endLocal);
      const h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, '0');
      timeStr += ` - ${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
    }

    return {
      title: e.name?.text || '',
      summary: (e.summary || e.description?.text || '').substring(0, 300),
      venue: venueName,
      address: venueAddr,
      city: venueCity,
      date: dateStr,
      time: timeStr.trim(),
      price: isFree ? 'Free' : 'See event',
      url: e.url || '',
      image: e.logo?.url || null,
      category_id: e.category_id || '',
      subcategory_id: e.subcategory_id || '',
    };
  });
}

// ── CLAUDE ENRICHMENT ──
async function enrichEvents(formattedEvents, city) {
  if (!formattedEvents.length) return [];

  const cityName = city.split(',')[0].trim();
  const today = new Date().toISOString().split('T')[0];

  const prompt = `You are a food event curator for SABOR, a food discovery app in ${cityName}. Today is ${today}.

I have ${formattedEvents.length} events from Eventbrite. Your job: pick the BEST food & drink events and enrich them for our app.

INCLUDE these types:
- Food festivals, pop-ups, tasting dinners, supper clubs
- Happy hours, drink specials, wine/beer/cocktail tastings
- Taco events, BBQ, brunch events, bottomless specials
- Cooking classes, chef collaborations, farm-to-table dinners
- Food truck rallies, night markets, street food events
- Latin/Mexican food celebrations
- Restaurant events with a specific food angle

EXCLUDE:
- Generic nightlife with no food angle (pure DJ/dance events)
- Conferences or trade shows
- Networking events where food is incidental
- Events that already passed (before ${today})
- Events with no clear food/drink component

For each selected event, classify it:

EVENTS:
${JSON.stringify(formattedEvents, null, 2)}

Respond ONLY with a valid JSON array (no markdown, no backticks):
[
  {
    "title": "cleaned event title",
    "description": "1-2 sentence description focusing on the FOOD aspect",
    "venue": "venue name",
    "neighborhood": "Chicago neighborhood or area name",
    "date": "Day, Month Date",
    "time": "start - end",
    "price": "$XX" or "Free" or "See venue",
    "category": "happy_hour" | "festival" | "pop_up" | "tasting" | "brunch" | "class" | "food_truck" | "special" | "market",
    "vibe": "one of: Happy Hour, Festival, Tasting, Brunch, Pop-Up, Cooking Class, Food Trucks, Market, Food Event",
    "recurring": false,
    "url": "event URL",
    "image": "image URL or null",
    "tags": ["relevant", "food", "tags"],
    "confidence": "high" or "medium"
  }
]

Be selective — quality over quantity. Only "high" and "medium" confidence. Return [] if nothing qualifies.`;

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
    console.log(`🎯 Claude selected ${events.length} food events from ${formattedEvents.length} candidates`);
    return events;
  } catch (err) {
    console.error('Claude enrichment failed:', err.message);
    return [];
  }
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

  // Firestore batches max 500 writes
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
      recurring: event.recurring || false,
      confidence: event.confidence || 'medium',
      scoutedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + (event.recurring ? 7 : 14) * 24 * 60 * 60 * 1000).toISOString(),
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
  console.log(`🗑️ Cleaned ${expired.size} expired events`);
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
    // Step 1: Collect raw events from Eventbrite
    const rawEvents = await collectEvents(city);

    if (rawEvents.length === 0) {
      const cleaned = await cleanupExpired();
      return res.status(200).json({
        success: true, city,
        searched: 10, collected: 0, enriched: 0, stored: 0, cleaned,
        events: [],
        note: 'No events found from Eventbrite — check API token',
      });
    }

    // Step 2: Format for Claude
    const formatted = formatEventsForClaude(rawEvents);
    console.log(`📝 ${formatted.length} events formatted for enrichment`);

    // Step 3: Claude enrichment — picks best food events and classifies them
    const enriched = await enrichEvents(formatted, city);

    // Step 4: Store in Firestore
    const stored = await storeEvents(enriched, city);

    // Step 5: Cleanup expired
    const cleaned = await cleanupExpired();

    return res.status(200).json({
      success: true,
      city,
      searched: 10,
      collected: rawEvents.length,
      enriched: enriched.length,
      stored,
      cleaned,
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
