// api/event-scout-web.js — Web-based Event Scout
// Uses Brave Search API to find Latin/food festivals in Chicago area
// then Claude Haiku to extract structured event data → stores in Firestore
//
// Triggered by:
// 1. Vercel Cron (every Sunday at 10 AM CT → "0 15 * * 0" UTC)
// 2. Manual POST with X-API-Secret header

import Anthropic from '@anthropic-ai/sdk';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Base search queries — covers Latin, food, cultural, farm events ──
const BASE_QUERIES = [
  // Latin/Mexican core
  'Latin food festival Chicago 2026',
  'Hispanic festival Chicago 2026',
  'Mexican food festival Chicago Illinois 2026',
  'fiesta Chicago Illinois 2026',
  'taco festival Chicago 2026',
  'Puerto Rican festival Chicago 2026',
  'Colombian festival Chicago 2026',
  'Caribbean festival Chicago 2026',
  // Suburbs — Latin
  'Spanish festival Elgin Illinois 2026',
  'jaripeo Elgin Illinois 2026',
  'jaripeo Chicago suburbs 2026',
  'charreada Illinois 2026',
  'Mexican rodeo Aurora Waukegan Joliet 2026',
  'Latino festival Aurora Joliet Waukegan 2026',
  // Farm / agritourism / morning drinking
  'farm brunch Illinois 2026',
  'winery brunch Chicago suburbs 2026',
  'agritourism event Illinois 2026',
  'vineyard festival Illinois 2026',
  'farm to table brunch Illinois 2026',
  'orchard festival drinking Illinois 2026',
  // Food fests general
  'Chicago food festival summer 2026',
  'food truck festival Chicago 2026',
  'cultural food festival Chicago Illinois 2026',
  'Latino festival Chicago suburbs 2026',
];

// ── Load learned queries from Firestore (added by AI after each run) ──
async function loadLearnedQueries() {
  try {
    const snap = await db.collection('scout_learned_queries')
      .where('active', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    return snap.docs.map(d => d.data().query).filter(Boolean);
  } catch {
    return [];
  }
}

// ── After each run, ask Claude to suggest new search queries based on what was found ──
async function generateLearnedQueries(foundEvents) {
  if (!foundEvents.length) return;
  try {
    const sample = foundEvents.slice(0, 15).map(e =>
      `- ${e.title} (${e.neighborhood || e.city}, ${e.date})`
    ).join('\n');

    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `You are helping SABOR, a Chicago-area food & Latin culture discovery app, find more events.

Based on these events found this week:
${sample}

Generate 5 NEW web search queries to find MORE events like these — especially:
- Jaripeos, charreadas, Mexican rodeos in Illinois suburbs
- Farm brunches, winery mornings, agritourism with food/drinks
- Niche Latin/cultural food events in Chicago suburbs (Elgin, Aurora, Waukegan, Joliet, Cicero, Berwyn)
- Events we likely missed

Rules:
- Each query must include a year (2026) and location (city or Illinois/Chicago)
- No duplicates of common queries already being searched
- Focus on underserved niches

Respond ONLY with a JSON array of 5 query strings:
["query 1", "query 2", "query 3", "query 4", "query 5"]`
      }],
    });

    let raw = msg.content[0]?.text?.trim() || '[]';
    if (raw.startsWith('```')) raw = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    const queries = JSON.parse(raw);
    if (!Array.isArray(queries)) return;

    const batch = db.batch();
    const col = db.collection('scout_learned_queries');
    for (const query of queries) {
      if (typeof query !== 'string' || query.length < 10) continue;
      const id = query.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 60);
      batch.set(col.doc(id), {
        query,
        active: true,
        createdAt: new Date().toISOString(),
        source: 'auto-learned',
      }, { merge: true });
    }
    await batch.commit();
    console.log(`🧠 Learned ${queries.length} new search queries for next run`);
  } catch (err) {
    console.error('Learning loop failed:', err.message);
  }
}

// ── Brave Search ──
async function braveSearch(query) {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return [];

  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&freshness=py`;
    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': key,
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.web?.results || []).map(r => ({
      title: r.title || '',
      url: r.url || '',
      description: r.description || '',
    }));
  } catch (err) {
    console.error(`Brave search failed for "${query}":`, err.message);
    return [];
  }
}

// ── Fetch page content ──
async function fetchPageText(url) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SABOR-EventScout/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    // Strip HTML tags and collapse whitespace for Claude
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 3000);
  } catch {
    return null;
  }
}

// ── Claude extracts structured events from search results ──
async function extractEvents(searchResults, query) {
  if (!searchResults.length) return [];

  const today = new Date().toISOString().split('T')[0];
  const context = searchResults
    .map((r, i) => `[${i + 1}] TITLE: ${r.title}\nURL: ${r.url}\nSNIPPET: ${r.description}`)
    .join('\n\n');

  const prompt = `You are an event data extractor for SABOR, a food discovery app in Chicago. Today is ${today}.

Search query: "${query}"

From these search results, extract ONLY real food/cultural events happening in 2026 in Chicago, Illinois or nearby suburbs (Elgin, Aurora, Joliet, Waukegan, etc.).

RULES:
- Events must be in 2026 and AFTER ${today}
- Must have food or drink component
- Must have a real confirmed date (not "TBD" unless month is known)
- NO duplicate events (same name + similar date = skip)
- Skip events that are clearly past, cancelled, or have no food angle
- Skip ticketing/listing aggregator pages with no specific event info

SEARCH RESULTS:
${context}

Respond ONLY with valid JSON array (empty array [] if nothing qualifies):
[{
  "title": "exact event name",
  "description": "1-2 sentence food-focused description",
  "venue": "venue name",
  "neighborhood": "neighborhood or suburb name",
  "city": "City, IL or City, IN",
  "date": "Day, Month Date (e.g. Saturday, July 12)",
  "time": "start time or empty string",
  "price": "price string or Free",
  "priceNum": 0,
  "category": "festival|music_fest|tasting|brunch|happy_hour|pop_up|market|special",
  "vibe": "Festival|Music Festival|Tasting|Brunch|Happy Hour|Pop-Up|Market|Food Event",
  "url": "event URL",
  "tags": ["food", "sabor", "relevant", "tags"],
  "confidence": "high|medium"
}]`;

  try {
    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });
    let raw = msg.content[0]?.text?.trim() || '[]';
    if (raw.startsWith('```')) raw = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Claude extraction failed:', err.message);
    return [];
  }
}

// ── Deduplicate against existing Firestore events ──
async function getExistingTitles() {
  try {
    const snap = await db.collection('sabor_events').select('title').get();
    return new Set(snap.docs.map(d => d.data().title?.toLowerCase().replace(/[^a-z0-9]/g, '')));
  } catch {
    return new Set();
  }
}

// ── Store events in Firestore ──
async function storeEvents(events) {
  if (!events.length) return 0;

  const existing = await getExistingTitles();
  const emojiMap = {
    festival: '🎉', tasting: '🍷', brunch: '🥂', happy_hour: '🍹',
    pop_up: '🔥', market: '🏪', special: '⭐',
  };

  const now = new Date();
  const batch = db.batch();
  let stored = 0;

  for (const event of events) {
    if (!event.title || !event.date) continue;

    // Skip if already exists
    const key = event.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (existing.has(key)) {
      console.log(`⏭ Skipping duplicate: ${event.title}`);
      continue;
    }

    // Skip low-confidence events without venue
    if (event.confidence === 'medium' && !event.venue) continue;

    const idBase = `${event.title}_${event.venue || 'chicago'}`.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
    const docId = `webscout_${idBase}`;

    batch.set(db.collection('sabor_events').doc(docId), {
      id: docId,
      title: event.title,
      description: event.description || '',
      venue: event.venue || 'Chicago',
      neighborhood: event.neighborhood || 'Chicago',
      city: event.city || 'Chicago, IL',
      date: event.date || '',
      time: event.time || '',
      price: event.price || 'See event',
      priceNum: parseInt(event.priceNum) || 0,
      category: event.category || 'festival',
      vibe: event.vibe || 'Festival',
      emoji: emojiMap[event.category] || '🎉',
      image: null,
      premiumOnly: false,
      earlyAccess: false,
      tags: [...(event.tags || []), 'food'].filter((v, i, a) => a.indexOf(v) === i),
      source: 'SABOR',
      url: event.url || null,
      recurring: false,
      confidence: event.confidence || 'medium',
      scoutedAt: now.toISOString(),
      scoutedBy: 'event-scout-web',
      expiresAt: new Date(now.getTime() + 90 * 86400000).toISOString(), // 90 days — will auto-clean
    }, { merge: true });

    stored++;
    existing.add(key); // prevent intra-batch dupes
  }

  if (stored > 0) await batch.commit();
  return stored;
}

// ── HANDLER ──
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth: cron or secret header
  const isCron = req.headers['x-vercel-cron'] === '1';
  if (!isCron) {
    const secret = req.headers['x-api-secret'];
    if (secret !== process.env.NOTIFY_API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!process.env.BRAVE_API_KEY) {
    return res.status(500).json({ error: 'BRAVE_API_KEY not set. Get a free key at brave.com/search/api/' });
  }

  console.log('🔍 Web event scout starting...');

  // Combine base queries with AI-learned queries from previous runs
  const learnedQueries = await loadLearnedQueries();
  const SEARCH_QUERIES = [...new Set([...BASE_QUERIES, ...learnedQueries])];
  console.log(`📋 Running ${SEARCH_QUERIES.length} queries (${BASE_QUERIES.length} base + ${learnedQueries.length} learned)`);

  const allEvents = [];
  const errors = [];

  // Run searches in batches of 3 to avoid rate limits
  for (let i = 0; i < SEARCH_QUERIES.length; i += 3) {
    const batchQueries = SEARCH_QUERIES.slice(i, i + 3);
    const results = await Promise.all(
      batchQueries.map(async (query) => {
        const searchResults = await braveSearch(query);
        const events = await extractEvents(searchResults, query);
        console.log(`  "${query}" → ${events.length} events found`);
        return events;
      })
    );
    allEvents.push(...results.flat());
    if (i + 3 < SEARCH_QUERIES.length) await new Promise(r => setTimeout(r, 500));
  }

  // Deduplicate by title across all results
  const seen = new Set();
  const unique = allEvents.filter(e => {
    const key = e.title?.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const stored = await storeEvents(unique);

  // Learning loop — generate new queries for next week based on what we found
  await generateLearnedQueries(unique);

  console.log(`✅ Web scout done: ${unique.length} unique events found, ${stored} new stored`);

  return res.status(200).json({
    success: true,
    searched: SEARCH_QUERIES.length,
    base: BASE_QUERIES.length,
    learned: learnedQueries.length,
    found: allEvents.length,
    unique: unique.length,
    stored,
    errors,
  });
}
