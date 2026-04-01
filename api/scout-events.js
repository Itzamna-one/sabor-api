// api/scout-events.js — AI Event Scout
// Searches the web for real food events, happy hours, pop-ups, and festivals.
// Uses SerpAPI for search + Claude Haiku for intelligent extraction.
// Stores verified events in Firestore for the SABOR events feed.
//
// Triggered by:
// 1. Vercel Cron (daily at 6 AM CT)
// 2. Manual POST with NOTIFY_API_SECRET header

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

// ── SEARCH QUERIES ──
// Designed to surface real, verified food events — not blog posts or old listings.
// Rotates daily so we don't hit the same results every run.
function getSearchQueries(city, dayOfWeek) {
  const cityName = city.split(',')[0].trim();
  const base = [
    `food events ${cityName} this week 2026`,
    `happy hour specials ${cityName} this week`,
    `food truck rally ${cityName} 2026`,
    `pop up dinner ${cityName} this month`,
    `taco tuesday ${cityName} specials`,
    `restaurant week ${cityName} 2026`,
    `food festival ${cityName} upcoming`,
    `brunch event ${cityName} this weekend`,
    `wine tasting dinner ${cityName}`,
    `night market ${cityName} 2026`,
    `cooking class ${cityName} this month`,
    `brewery food event ${cityName}`,
    `latin food festival ${cityName}`,
    `street food market ${cityName} 2026`,
  ];

  // Day-specific queries
  const daySpecific = {
    0: [`sunday brunch specials ${cityName}`, `sunday funday food ${cityName}`],
    1: [`monday food deals ${cityName}`, `industry night ${cityName}`],
    2: [`taco tuesday ${cityName}`, `tuesday food specials ${cityName}`],
    3: [`wine wednesday ${cityName}`, `wednesday happy hour ${cityName}`],
    4: [`thirsty thursday ${cityName} food`, `thursday specials ${cityName}`],
    5: [`friday happy hour ${cityName}`, `friday night food event ${cityName}`],
    6: [`saturday food festival ${cityName}`, `saturday brunch ${cityName}`],
  };

  // Pick 6 base queries (rotate by day) + 2 day-specific
  const rotated = [...base.slice(dayOfWeek * 2), ...base.slice(0, dayOfWeek * 2)];
  return [...rotated.slice(0, 6), ...(daySpecific[dayOfWeek] || [])];
}

// ── SERPAPI SEARCH ──
async function searchWeb(query) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) { console.error('SERPAPI_KEY not set'); return []; }

  try {
    const params = new URLSearchParams({
      q: query,
      api_key: apiKey,
      engine: 'google',
      num: 8,
      gl: 'us',
      hl: 'en',
    });
    const resp = await fetch(`https://serpapi.com/search?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) { console.error(`SerpAPI error: ${resp.status}`); return []; }
    const data = await resp.json();

    // Extract organic results + events pack if available
    const organic = (data.organic_results || []).map(r => ({
      title: r.title || '',
      snippet: r.snippet || '',
      link: r.link || '',
      date: r.date || '',
    }));

    const events = (data.events_results || []).map(r => ({
      title: r.title || '',
      snippet: r.description || '',
      link: r.link || '',
      date: r.date?.when || '',
      venue: r.venue?.name || '',
      address: r.venue?.address || '',
    }));

    return [...events, ...organic];
  } catch (err) {
    console.error(`Search failed for "${query}":`, err.message);
    return [];
  }
}

// ── CLAUDE EXTRACTION ──
async function extractEvents(searchResults, city) {
  if (!searchResults.length) return [];

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const cityName = city.split(',')[0].trim();

  const prompt = `You are an event data extractor for a food discovery app in ${cityName}. Today is ${dateStr}.

Given these web search results, extract ONLY real, verified food-related events. Include:
- Food festivals, pop-ups, tasting dinners
- Happy hours at specific restaurants (recurring weekly counts!)
- Taco Tuesdays, Wine Wednesdays, and other recurring food specials
- Food truck rallies and night markets
- Cooking classes and chef events
- Brunch events and bottomless specials
- Restaurant week events
- Beer/wine/cocktail tasting events

STRICT RULES:
- ONLY extract events with a REAL venue name and a date/day (even "every Tuesday" counts)
- NO blog posts, listicles, or "top 10" articles — those are NOT events
- NO events that already happened (before today)
- NO duplicates (same event from multiple search results)
- For recurring events (happy hours, Taco Tuesday), set recurring: true and include the day of week
- Price should be specific if available, otherwise "See venue" or "Free"
- URL must be a real link to event details or the venue

Search results:
${JSON.stringify(searchResults.slice(0, 30), null, 2)}

Respond ONLY with valid JSON array (no markdown, no backticks):
[
  {
    "title": "event name",
    "description": "1-2 sentence description with specific food/drink details",
    "venue": "real venue name",
    "neighborhood": "neighborhood or area in ${cityName}",
    "date": "Day, Month Date" or "Every Tuesday" for recurring,
    "time": "start time - end time" or "varies",
    "price": "$XX" or "Free" or "See venue",
    "category": "happy_hour" | "festival" | "pop_up" | "tasting" | "brunch" | "class" | "food_truck" | "special" | "market",
    "recurring": true/false,
    "recurringDay": "tuesday" (only if recurring),
    "url": "link to event or venue page",
    "tags": ["relevant", "tags"],
    "confidence": "high" | "medium" (how sure you are this is a real, current event)
  }
]

Only include events with "high" or "medium" confidence. If no valid events found, return [].`;

  try {
    const message = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0]?.text || '[]';
    // Try to parse — handle markdown wrapping
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    }
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('Claude extraction failed:', err.message);
    return [];
  }
}

// ── FIRESTORE STORAGE ──
async function storeEvents(events, city) {
  if (!events.length) return 0;

  const batch = db.batch();
  const collection = db.collection('sabor_events');
  let stored = 0;

  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const now = new Date();

  for (const event of events) {
    if (!event.title || !event.venue) continue;
    if (event.confidence === 'low') continue;

    // Generate stable ID to prevent duplicates
    const idBase = `${event.title}_${event.venue}`.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
    const docId = `scout_${idBase}`;

    // Format date for the app
    let formattedDate = event.date || '';
    if (event.recurring && event.recurringDay) {
      // Find next occurrence of this day
      const targetDay = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(event.recurringDay.toLowerCase());
      if (targetDay >= 0) {
        const daysUntil = (targetDay - now.getDay() + 7) % 7;
        const nextDate = new Date(now);
        nextDate.setDate(now.getDate() + (daysUntil === 0 ? 0 : daysUntil));
        formattedDate = `${days[nextDate.getDay()]}, ${months[nextDate.getMonth()]} ${nextDate.getDate()}`;
      }
    }

    // Determine emoji based on category
    const emojiMap = {
      'happy_hour': '🍹', 'festival': '🎉', 'pop_up': '🔥', 'tasting': '🍷',
      'brunch': '🥂', 'class': '👨‍🍳', 'food_truck': '🌮', 'special': '⭐', 'market': '🏪',
    };

    const doc = {
      id: docId,
      title: event.title,
      description: event.description || '',
      venue: event.venue,
      neighborhood: event.neighborhood || city.split(',')[0].trim(),
      city,
      date: formattedDate,
      time: event.time || '',
      price: event.price || 'See venue',
      priceNum: parseInt(event.price?.replace(/[^0-9]/g, '')) || 0,
      category: event.category || 'special',
      vibe: event.category === 'happy_hour' ? 'Happy Hour' : event.category === 'brunch' ? 'Brunch' : 'Food Event',
      emoji: emojiMap[event.category] || '🍽️',
      image: null,
      premiumOnly: false,
      earlyAccess: false,
      tags: [...(event.tags || []), 'food', event.category, ...(event.recurring ? ['recurring'] : [])],
      source: 'SABOR',
      url: event.url || null,
      recurring: event.recurring || false,
      recurringDay: event.recurringDay || null,
      confidence: event.confidence || 'medium',
      scoutedAt: now.toISOString(),
      // TTL: recurring events last 7 days, one-time events last until their date + 1 day
      expiresAt: new Date(now.getTime() + (event.recurring ? 7 : 14) * 24 * 60 * 60 * 1000).toISOString(),
    };

    batch.set(collection.doc(docId), doc, { merge: true });
    stored++;
  }

  await batch.commit();
  console.log(`✅ Stored ${stored} events for ${city}`);
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

  // Auth: require secret for manual triggers (cron is authenticated by Vercel)
  const isCron = req.headers['x-vercel-cron'] === 'true';
  if (!isCron) {
    const secret = req.headers['api_secret'] || req.query?.secret;
    if (secret !== process.env.NOTIFY_API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const city = req.query?.city || req.body?.city || 'Chicago, IL';
  const dayOfWeek = new Date().getDay();

  console.log(`🔍 Event Scout starting for ${city} (day ${dayOfWeek})`);

  try {
    // Step 1: Get search queries for today
    const queries = getSearchQueries(city, dayOfWeek);
    console.log(`📋 ${queries.length} search queries`);

    // Step 2: Search the web (parallel, 4 at a time to respect rate limits)
    const allResults = [];
    for (let i = 0; i < queries.length; i += 4) {
      const batch = queries.slice(i, i + 4);
      const results = await Promise.all(batch.map(q => searchWeb(q)));
      allResults.push(...results.flat());
    }
    console.log(`🌐 ${allResults.length} raw search results`);

    // Step 3: Deduplicate by URL
    const seen = new Set();
    const unique = allResults.filter(r => {
      const key = r.link?.toLowerCase() || r.title?.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log(`📝 ${unique.length} unique results after dedup`);

    // Step 4: Extract events with Claude
    const events = await extractEvents(unique, city);
    console.log(`🎯 ${events.length} events extracted by AI`);

    // Step 5: Store in Firestore
    const stored = await storeEvents(events, city);

    // Step 6: Cleanup expired events
    const cleaned = await cleanupExpired();

    return res.status(200).json({
      success: true,
      city,
      searched: queries.length,
      rawResults: unique.length,
      extracted: events.length,
      stored,
      cleaned,
      events: events.map(e => ({ title: e.title, venue: e.venue, date: e.date, category: e.category })),
    });
  } catch (err) {
    console.error('Scout error:', err.message);
    return res.status(500).json({ error: 'Scout failed', message: err.message });
  }
}
