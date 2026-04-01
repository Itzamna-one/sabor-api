// api/scout-events.js — AI Event Scout
// Sources: Ticketmaster API + Resy Experiences + OpenTable Experiences
// Claude Haiku curates the best food & drink events as SABOR picks.
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

// ── CITY CONFIG ──
const CITY_META = {
  'chicago': {
    resySlug: 'chi',
    openTableMetro: '3',
    lat: 41.8781, lng: -87.6298,
  },
  'indianapolis': {
    resySlug: 'ind',
    openTableMetro: '197',
    lat: 39.7684, lng: -86.1581,
  },
};

// ══════════════════════════════════════════════════════════════════
// SOURCE 1: TICKETMASTER
// ══════════════════════════════════════════════════════════════════
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
    if (!resp.ok) return { events: [], error: `TM ${resp.status}` };
    const data = await resp.json();
    return { events: data?._embedded?.events || [], error: null };
  } catch (err) {
    return { events: [], error: err.message };
  }
}

async function collectTicketmaster(city) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return { events: [], errors: ['TICKETMASTER_API_KEY not set'] };

  const foodQueries = [
    { keyword: 'food festival', size: 12 },
    { keyword: 'food truck', size: 8 },
    { keyword: 'wine tasting', size: 8 },
    { keyword: 'beer festival', size: 8 },
    { keyword: 'brunch', size: 8 },
    { keyword: 'cooking class', size: 6 },
    { keyword: 'taco', size: 6 },
    { keyword: 'bbq barbecue', size: 6 },
    { keyword: 'cocktail', size: 6 },
    { keyword: 'happy hour', size: 6 },
    { keyword: 'chef dinner', size: 6 },
    { keyword: 'latin food mexican', size: 6 },
    { keyword: 'prix fixe', size: 6 },
    { keyword: 'supper club', size: 6 },
    { keyword: 'distillery tasting', size: 6 },
    { keyword: 'night market', size: 6 },
  ];

  const errors = [];
  const allEvents = [];

  for (let i = 0; i < foodQueries.length; i += 4) {
    const batch = foodQueries.slice(i, i + 4);
    const results = await Promise.all(
      batch.map(q => searchTicketmaster(q.keyword, city, apiKey, q))
    );
    for (const r of results) {
      allEvents.push(...r.events);
      if (r.error) errors.push(r.error);
    }
    if (i + 4 < foodQueries.length) await new Promise(r => setTimeout(r, 300));
  }

  // Deduplicate by event ID
  const seen = new Set();
  const unique = allEvents.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  return { events: unique, errors };
}

function formatTicketmasterForClaude(tmEvents, city) {
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
      source: 'ticketmaster',
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

// ══════════════════════════════════════════════════════════════════
// SOURCE 2: RESY — Search for venues with availability/experiences
// Uses the internal Resy API (public key from their website)
// ══════════════════════════════════════════════════════════════════
async function collectResy(city) {
  const cityName = city.split(',')[0].trim().toLowerCase();
  const meta = CITY_META[cityName];
  if (!meta) return { venues: [], error: `No Resy config for ${cityName}` };

  const queries = ['tasting menu', 'prix fixe', 'happy hour', 'chef', 'brunch', 'omakase', 'cocktail', 'wine dinner'];
  const allVenues = [];
  const errors = [];

  // Run queries in batches of 4
  for (let i = 0; i < queries.length; i += 4) {
    const batch = queries.slice(i, i + 4);
    const results = await Promise.all(batch.map(async (query) => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const url = `https://api.resy.com/4/find?lat=${meta.lat}&long=${meta.lng}&day=${today}&party_size=2&query=${encodeURIComponent(query)}`;
        const resp = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': 'ResyAPI api_key="VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5"',
            'Accept': 'application/json',
            'Origin': 'https://resy.com',
            'Referer': 'https://resy.com/',
          },
          signal: AbortSignal.timeout(6000),
        });
        if (!resp.ok) return { venues: [], error: `${resp.status} for "${query}"` };
        const data = await resp.json();
        const results = data?.results || [];
        return {
          venues: results.map(r => ({
            source: 'resy',
            name: r.venue?.name || '',
            cuisine: r.venue?.cuisine || [],
            neighborhood: r.venue?.neighborhood || '',
            price: r.venue?.price_range || 0,
            rating: r.venue?.rating || null,
            tagline: r.venue?.tagline || '',
            slug: r.venue?.url_slug || '',
            query,
          })),
          error: null,
        };
      } catch (err) {
        return { venues: [], error: `"${query}": ${err.message}` };
      }
    }));

    for (const r of results) {
      allVenues.push(...r.venues);
      if (r.error) errors.push(r.error);
    }
    if (i + 4 < queries.length) await new Promise(r => setTimeout(r, 300));
  }

  // Deduplicate by venue name
  const seen = new Set();
  const unique = allVenues.filter(v => {
    const key = v.name.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { venues: unique, errors };
}

// ══════════════════════════════════════════════════════════════════
// SOURCE 3: YELP EVENTS API
// Official Yelp Fusion events endpoint with food-and-drink filter
// ══════════════════════════════════════════════════════════════════
async function collectYelpEvents(city) {
  const yelpKey = process.env.YELP_API_KEY;
  if (!yelpKey) return { events: [], error: 'YELP_API_KEY not set' };

  const cityName = city.split(',')[0].trim();
  const allEvents = [];
  const errors = [];

  // Food & drink category + general events with food keywords
  const searches = [
    { categories: 'food-and-drink', limit: 20 },
    { categories: 'nightlife', limit: 10 },
    { categories: 'festivals-fairs', limit: 10 },
  ];

  for (const search of searches) {
    try {
      const params = new URLSearchParams({
        location: cityName,
        categories: search.categories,
        limit: String(search.limit),
        sort_on: 'time_start',
        sort_by: 'asc',
        start_date: Math.floor(Date.now() / 1000),
      });
      const url = `https://api.yelp.com/v3/events?${params}`;
      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${yelpKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) {
        errors.push(`Yelp ${search.categories}: ${resp.status}`);
        continue;
      }
      const data = await resp.json();
      allEvents.push(...(data?.events || []));
    } catch (err) {
      errors.push(`Yelp ${search.categories}: ${err.message}`);
    }
  }

  // Deduplicate
  const seen = new Set();
  const unique = allEvents.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  return { events: unique, errors };
}

function formatYelpForClaude(yelpEvents) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  return yelpEvents.map(e => {
    let dateStr = '', timeStr = '';
    if (e.time_start) {
      const d = new Date(e.time_start);
      dateStr = `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
      const h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, '0');
      timeStr = `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
      if (e.time_end) {
        const end = new Date(e.time_end);
        const eh = end.getHours();
        const em = String(end.getMinutes()).padStart(2, '0');
        timeStr += ` - ${eh === 0 ? 12 : eh > 12 ? eh - 12 : eh}:${em} ${eh >= 12 ? 'PM' : 'AM'}`;
      }
    }

    return {
      source: 'yelp',
      title: e.name || '',
      description: (e.description || '').substring(0, 300),
      venue: e.business_id || e.location?.display_address?.join(', ') || 'See event',
      address: e.location?.display_address?.join(', ') || '',
      city: e.location?.city || '',
      date: dateStr,
      time: timeStr,
      price: e.cost_max ? `$${e.cost}–$${e.cost_max}` : e.cost ? `$${e.cost}` : (e.is_free ? 'Free' : 'See event'),
      url: e.event_site_url || '',
      image: e.image_url || null,
      attending: e.attending_count || 0,
      interested: e.interested_count || 0,
      category: e.category || '',
    };
  });
}

// ══════════════════════════════════════════════════════════════════
// CLAUDE ENRICHMENT — processes all sources together
// ══════════════════════════════════════════════════════════════════
async function enrichAllEvents(tmFormatted, resyVenues, yelpFormatted, city) {
  const cityName = city.split(',')[0].trim();
  const today = new Date().toISOString().split('T')[0];
  const allEnriched = [];

  // ── PASS 1: Ticketmaster events (structured data) ──
  if (tmFormatted.length > 0) {
    const chunks = [];
    for (let i = 0; i < tmFormatted.length; i += 30) {
      chunks.push(tmFormatted.slice(i, i + 30));
    }

    for (const chunk of chunks) {
      const prompt = `You are a food event curator for SABOR, a food discovery app in ${cityName}. Today is ${today}.

From these ${chunk.length} Ticketmaster events, select ONLY the ones that are genuinely food or drink related.

INCLUDE: Food festivals, tastings, cook-offs, wine/beer/cocktail events, brunch events, dinner shows, chef events, cooking classes, events at restaurants/breweries/wineries, cultural food festivals, BBQ competitions, night markets, pop-ups, happy hours.

EXCLUDE: Pure concerts/sports with no food angle, conferences, events before ${today}.
DUPLICATES: If the same event appears at different dates, list it ONCE with the earliest upcoming date.

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
        console.error('Claude TM enrichment failed:', err.message);
      }
    }
  }

  // ── PASS 2: Resy venues + Yelp events — high-end dining experiences ──
  const extraSources = [];
  if (resyVenues.length > 0) {
    extraSources.push(`=== RESY HIGH-END VENUES (${cityName}) ===\nThese are restaurants on Resy with availability. Create events for their notable dining experiences.\n${JSON.stringify(resyVenues.slice(0, 20), null, 2)}`);
  }
  if (yelpFormatted.length > 0) {
    extraSources.push(`=== YELP FOOD & DRINK EVENTS (${cityName}) ===\n${JSON.stringify(yelpFormatted, null, 2)}`);
  }

  if (extraSources.length > 0) {
    const extraPrompt = `You are a food event curator for SABOR, a food discovery app in ${cityName}. Today is ${today}.

I have data from Resy (upscale restaurant venues) and/or Yelp (food & drink events). Create curated SABOR picks from this data.

FOR RESY VENUES — turn them into bookable dining experiences:
- Create entries for their tasting menus, omakase, chef's tables, prix fixe, happy hours
- Use the venue name, cuisine, neighborhood, and price range to craft a compelling description
- Date should be "Ongoing" for these since they're regular offerings
- Include the Resy booking URL
- ONLY include venues that clearly offer a special dining experience (not just any restaurant)

FOR YELP EVENTS — curate the best food & drink events:
- Happy hours, wine tastings, food festivals, cooking classes, pop-ups
- Include date, time, price, and venue details
- Skip anything that's not genuinely food/drink focused

PRIORITIZE: High-end experiences, unique culinary events, craft cocktail tastings, chef collaborations, seasonal menus, upscale happy hours.

DATA:
${extraSources.join('\n\n')}

Respond ONLY with a valid JSON array (no markdown, no backticks):
[{"title":"experience/event name","description":"1-2 sentences highlighting what makes it special","venue":"restaurant/bar name","neighborhood":"area in ${cityName}","date":"Ongoing" or "Day, Month Date","time":"hours or specific time","price":"$XX or $$$ tier or See venue","category":"tasting|brunch|happy_hour|pop_up|special|class","vibe":"Tasting|Brunch|Happy Hour|Pop-Up|Chef's Table|Food Event","url":"booking URL","image":null,"tags":["upscale","relevant","tags"],"confidence":"high|medium"}]

Return [] if nothing qualifies.`;

    try {
      const msg = await claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: extraPrompt }],
      });
      const raw = msg.content[0]?.text || '[]';
      let cleaned = raw.trim();
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      const extraEvents = JSON.parse(cleaned);
      console.log(`🍷 Claude extracted ${extraEvents.length} events from Resy/Yelp`);
      allEnriched.push(...extraEvents);
    } catch (err) {
      console.error('Claude Resy/Yelp enrichment failed:', err.message);
    }
  }

  // Deduplicate by title+venue
  const seen = new Set();
  const deduped = allEnriched.filter(e => {
    const key = `${e.title}_${e.venue}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`🎯 Total: ${deduped.length} food events (${allEnriched.length} before dedup)`);
  return deduped;
}

// ══════════════════════════════════════════════════════════════════
// FIRESTORE STORAGE
// ══════════════════════════════════════════════════════════════════
async function storeEvents(events, city) {
  if (!events.length) return 0;

  const collection = db.collection('sabor_events');
  const now = new Date();
  let stored = 0;

  const emojiMap = {
    'happy_hour': '🍹', 'festival': '🎉', 'pop_up': '🔥', 'tasting': '🍷',
    'brunch': '🥂', 'class': '👨‍🍳', 'food_truck': '🌮', 'special': '⭐',
    'market': '🏪', 'chefs_table': '👨‍🍳',
  };

  const batch = db.batch();

  for (const event of events) {
    if (!event.title || !event.venue) continue;

    const idBase = `${event.title}_${event.venue}`.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
    const docId = `scout_${idBase}`;

    // Events with specific dates get 14-day TTL; ongoing experiences get 7 days
    const isOngoing = /ongoing|every|weekly|daily/i.test(event.date || '');
    const ttlDays = isOngoing ? 7 : 14;

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
      recurring: isOngoing,
      confidence: event.confidence || 'medium',
      scoutedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000).toISOString(),
    };

    batch.set(collection.doc(docId), doc, { merge: true });
    stored++;
  }

  await batch.commit();
  console.log(`✅ Stored ${stored} SABOR events for ${city}`);
  return stored;
}

// ══════════════════════════════════════════════════════════════════
// CLEANUP EXPIRED
// ══════════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════
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
    // Step 1: Collect from ALL sources in parallel
    const [tmResult, resyResult, yelpResult] = await Promise.all([
      collectTicketmaster(city),
      collectResy(city),
      collectYelpEvents(city),
    ]);

    const tmEvents = tmResult.events;
    const resyVenues = resyResult.venues || [];
    const yelpEvents = yelpResult.events || [];

    const sourceDebug = {
      ticketmaster: { count: tmEvents.length, errors: tmResult.errors.slice(0, 3) },
      resy: { venues: resyVenues.length, errors: resyResult.errors?.slice(0, 3) || [] },
      yelp: { events: yelpEvents.length, errors: yelpResult.errors?.slice(0, 3) || [] },
    };

    console.log(`📊 TM: ${tmEvents.length} | Resy: ${resyVenues.length} venues | Yelp: ${yelpEvents.length} events`);

    // Step 2: Format for Claude
    const tmFormatted = formatTicketmasterForClaude(tmEvents, city);
    const yelpFormatted = formatYelpForClaude(yelpEvents);

    // Step 3: Claude enrichment — all sources
    const enriched = await enrichAllEvents(
      tmFormatted,
      resyVenues,
      yelpFormatted,
      city,
    );

    // Step 4: Store in Firestore
    const stored = await storeEvents(enriched, city);

    // Step 5: Cleanup expired
    const cleaned = await cleanupExpired();

    return res.status(200).json({
      success: true,
      city,
      sources: sourceDebug,
      enriched: enriched.length,
      stored,
      cleaned,
      events: enriched.map(e => ({
        title: e.title,
        venue: e.venue,
        date: e.date,
        category: e.category,
        neighborhood: e.neighborhood,
        price: e.price,
      })),
    });
  } catch (err) {
    console.error('Scout error:', err);
    return res.status(500).json({ error: 'Scout failed', message: err.message });
  }
}
