// api/scout-events.js — AI Event Scout
// Source: Ticketmaster Discovery API + Claude Haiku curation
// Finds food & drink events, stores as SABOR picks in Firestore.
//
// Future: Add Yelp Events API when revenue supports it ($299/mo)
// Free alternative: Brave Search API (2K free/mo) — add when needed
//
// Triggered by:
// 1. Vercel Cron (daily at 6 AM CT → "0 12 * * *" UTC)
// 2. Manual POST with API_SECRET header

import Anthropic from '@anthropic-ai/sdk';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── TICKETMASTER SEARCH ──
async function searchTM(keyword, city, apiKey, opts = {}) {
  try {
    const cityName = city.split(',')[0].trim();
    const today = new Date();
    const start = today.toISOString().split('.')[0] + 'Z';
    const end = new Date(today.getTime() + 30 * 86400000).toISOString().split('.')[0] + 'Z';

    let url = `https://app.ticketmaster.com/discovery/v2/events.json?keyword=${encodeURIComponent(keyword)}&city=${encodeURIComponent(cityName)}&startDateTime=${start}&endDateTime=${end}&size=${opts.size || 12}&sort=date,asc&apikey=${apiKey}`;
    if (opts.classificationName) url += `&classificationName=${encodeURIComponent(opts.classificationName)}`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data?._embedded?.events || [];
  } catch { return []; }
}

async function collectEvents(city) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return { events: [], errors: ['TICKETMASTER_API_KEY not set'] };

  const allEvents = [];
  const errors = [];

  // ── STRATEGY 1: Keyword search (food-specific terms) ──
  const foodKeywords = [
    'food festival', 'food truck', 'wine tasting', 'beer festival',
    'brunch', 'cooking class', 'taco', 'bbq barbecue',
    'cocktail', 'happy hour', 'chef dinner', 'latin food mexican',
    'prix fixe', 'supper club', 'distillery tasting', 'night market',
    'seafood', 'pizza fest', 'whiskey tasting', 'rooftop dining',
  ];

  for (let i = 0; i < foodKeywords.length; i += 4) {
    const batch = foodKeywords.slice(i, i + 4);
    const results = await Promise.all(batch.map(q => searchTM(q, city, apiKey, { size: 8 })));
    allEvents.push(...results.flat());
    if (i + 4 < foodKeywords.length) await new Promise(r => setTimeout(r, 300));
  }

  // ── STRATEGY 2: TM segment search (events classified as food/drink) ──
  // TM classifies some events under segments even if title doesn't say "food"
  const segmentQueries = [
    { keyword: '', classificationName: 'Food & Drink' },
    { keyword: 'dinner', classificationName: 'Food & Drink' },
    { keyword: 'tasting', classificationName: 'Food & Drink' },
  ];
  const segResults = await Promise.all(
    segmentQueries.map(q => searchTM(q.keyword, city, apiKey, { size: 20, classificationName: q.classificationName }))
  );
  allEvents.push(...segResults.flat());
  await new Promise(r => setTimeout(r, 300));

  // ── STRATEGY 3: Broader cultural queries that often involve food ──
  // TM has way more music/arts events — but many happen at restaurants,
  // breweries, and food venues. Claude will filter for food angle.
  const culturalKeywords = [
    'brewery', 'winery', 'distillery', 'rooftop',
    'jazz dinner', 'drag brunch', 'comedy dinner',
    'latin festival', 'cultural festival', 'street festival',
    'farmers market', 'pop up', 'speakeasy',
  ];

  for (let i = 0; i < culturalKeywords.length; i += 4) {
    const batch = culturalKeywords.slice(i, i + 4);
    const results = await Promise.all(batch.map(q => searchTM(q, city, apiKey, { size: 8 })));
    allEvents.push(...results.flat());
    if (i + 4 < culturalKeywords.length) await new Promise(r => setTimeout(r, 300));
  }

  // Deduplicate by TM event ID
  const seen = new Set();
  const unique = allEvents.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  return { events: unique, errors };
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

    let dateStr = '', timeStr = '';
    if (startLocal) {
      const d = new Date(startLocal + 'T' + (startTime || '00:00:00'));
      dateStr = `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
      if (startTime) {
        const [h, m] = startTime.split(':');
        const hour = parseInt(h);
        timeStr = `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
      }
    }

    return {
      title: e.name || '',
      description: (e.info || e.pleaseNote || '').substring(0, 300),
      venue: venue.name || 'TBA',
      address: venue.address?.line1 || '',
      city: venue.city?.name || city.split(',')[0].trim(),
      date: dateStr,
      time: timeStr,
      price: priceStr,
      url: e.url || '',
      image: e.images?.find(img => img.width >= 300)?.url || null,
    };
  });
}

// ── CLAUDE ENRICHMENT ──
async function enrichEvents(formatted, city) {
  if (!formatted.length) return [];

  const cityName = city.split(',')[0].trim();
  const today = new Date().toISOString().split('T')[0];
  const allEnriched = [];

  const chunks = [];
  for (let i = 0; i < formatted.length; i += 30) chunks.push(formatted.slice(i, i + 30));

  for (const chunk of chunks) {
    const prompt = `You are a food event curator for SABOR, a food discovery app in ${cityName}. Today is ${today}.

From these ${chunk.length} Ticketmaster events, select ONLY genuinely food or drink related ones.

INCLUDE: Food festivals, tastings, wine/beer/cocktail events, brunch events, dinner shows, chef events, cooking classes, events at restaurants/breweries/wineries, cultural food festivals, BBQ, night markets, pop-ups, happy hours, prix fixe dinners.

EXCLUDE: Pure concerts/sports with no food angle, conferences, events before ${today}.
NO DUPLICATES: Same event at different dates → list ONCE with earliest date.

EVENTS:
${JSON.stringify(chunk, null, 2)}

Respond ONLY with a valid JSON array (no markdown, no backticks):
[{"title":"event title","description":"1-2 sentences focusing on FOOD/DRINK","venue":"venue name","neighborhood":"area in ${cityName}","date":"Day, Month Date","time":"start time","price":"price","category":"festival|tasting|brunch|class|food_truck|special|market|happy_hour|pop_up","vibe":"Festival|Tasting|Brunch|Cooking Class|Food Trucks|Market|Happy Hour|Pop-Up|Food Event","url":"event URL","image":"image URL or null","tags":["relevant","tags"],"confidence":"high|medium"}]

Return [] if nothing qualifies.`;

    try {
      const msg = await claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });
      const raw = msg.content[0]?.text || '[]';
      let cleaned = raw.trim();
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      allEnriched.push(...JSON.parse(cleaned));
    } catch (err) {
      console.error('Claude enrichment failed:', err.message);
    }
  }

  // Deduplicate by title+venue
  const seen = new Set();
  return allEnriched.filter(e => {
    const key = `${e.title}_${e.venue}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── FIRESTORE STORAGE ──
async function storeEvents(events, city) {
  if (!events.length) return 0;

  const collection = db.collection('sabor_events');
  const now = new Date();
  const batch = db.batch();
  let stored = 0;

  const emojiMap = {
    'happy_hour': '🍹', 'festival': '🎉', 'pop_up': '🔥', 'tasting': '🍷',
    'brunch': '🥂', 'class': '👨‍🍳', 'food_truck': '🌮', 'special': '⭐', 'market': '🏪',
  };

  for (const event of events) {
    if (!event.title || !event.venue) continue;

    const idBase = `${event.title}_${event.venue}`.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
    const docId = `scout_${idBase}`;
    const isOngoing = /ongoing|every|weekly|daily/i.test(event.date || '');

    batch.set(collection.doc(docId), {
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
      recurring: isOngoing,
      confidence: event.confidence || 'medium',
      scoutedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + (isOngoing ? 7 : 14) * 86400000).toISOString(),
    }, { merge: true });
    stored++;
  }

  await batch.commit();
  return stored;
}

// ── CLEANUP EXPIRED ──
async function cleanupExpired() {
  const now = new Date().toISOString();
  const expired = await db.collection('sabor_events')
    .where('expiresAt', '<', now).limit(50).get();
  if (expired.empty) return 0;
  const batch = db.batch();
  expired.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  return expired.size;
}

// ── HANDLER ──
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, API_SECRET');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const isCron = req.headers['x-vercel-cron'] === 'true';
  if (!isCron) {
    const secret = req.headers['api_secret'] || req.query?.secret;
    if (secret !== process.env.NOTIFY_API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const city = req.query?.city || req.body?.city || 'Chicago, IL';

  try {
    const { events: raw, errors } = await collectEvents(city);

    if (raw.length === 0) {
      const cleaned = await cleanupExpired();
      return res.status(200).json({ success: true, city, collected: 0, enriched: 0, stored: 0, cleaned, events: [], errors });
    }

    const formatted = formatForClaude(raw, city);
    const enriched = await enrichEvents(formatted, city);
    const stored = await storeEvents(enriched, city);
    const cleaned = await cleanupExpired();

    return res.status(200).json({
      success: true, city,
      collected: raw.length,
      enriched: enriched.length,
      stored, cleaned,
      events: enriched.map(e => ({ title: e.title, venue: e.venue, date: e.date, category: e.category, neighborhood: e.neighborhood, price: e.price })),
    });
  } catch (err) {
    console.error('Scout error:', err);
    return res.status(500).json({ error: 'Scout failed', message: err.message });
  }
}
