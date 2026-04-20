// api/events.js — Real events via Ticketmaster + SABOR Scout (Firestore)
// SABOR Scout events are AI-curated food events stored by scout-events.js.
// Eventbrite search API deprecated (404) — removed.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { checkAppKey } from '../lib/sabor-security.js';

// Firebase Admin
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

// ── TICKETMASTER API ──
async function fetchTicketmasterEvents(city) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return [];

  try {
    const cityName = city.split(',')[0].trim();
    const today = new Date();
    const startDate = today.toISOString().split('.')[0] + 'Z';
    const endDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('.')[0] + 'Z';

    // Strategy: TM has limited "food" events. Search broader categories that pair with food
    // (concerts, comedy, nightlife — things people do around a meal) plus direct food keywords.
    // 4 parallel searches: food-specific, nightlife/music, arts/theatre, festivals/fairs
    const fetches = [
      // Food-specific: brunch, food festivals, tastings, wine dinners
      (async () => {
        try {
          const url = `https://app.ticketmaster.com/discovery/v2/events.json?keyword=food+brunch+dinner+tasting+festival+market&city=${encodeURIComponent(cityName)}&startDateTime=${startDate}&endDateTime=${endDate}&size=12&sort=date,asc&apikey=${apiKey}`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (!resp.ok) return [];
          const data = await resp.json();
          return data?._embedded?.events || [];
        } catch { return []; }
      })(),
      // Live music — concerts and shows pair perfectly with a food plan
      (async () => {
        try {
          const url = `https://app.ticketmaster.com/discovery/v2/events.json?classificationName=music&city=${encodeURIComponent(cityName)}&startDateTime=${startDate}&endDateTime=${endDate}&size=8&sort=date,asc&apikey=${apiKey}`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (!resp.ok) return [];
          const data = await resp.json();
          return data?._embedded?.events || [];
        } catch { return []; }
      })(),
      // Arts, theatre, comedy
      (async () => {
        try {
          const url = `https://app.ticketmaster.com/discovery/v2/events.json?classificationName=arts&city=${encodeURIComponent(cityName)}&startDateTime=${startDate}&endDateTime=${endDate}&size=6&sort=date,asc&apikey=${apiKey}`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (!resp.ok) return [];
          const data = await resp.json();
          return data?._embedded?.events || [];
        } catch { return []; }
      })(),
      // Sports — game day food plans are huge
      (async () => {
        try {
          const url = `https://app.ticketmaster.com/discovery/v2/events.json?classificationName=sports&city=${encodeURIComponent(cityName)}&startDateTime=${startDate}&endDateTime=${endDate}&size=6&sort=date,asc&apikey=${apiKey}`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (!resp.ok) return [];
          const data = await resp.json();
          return data?._embedded?.events || [];
        } catch { return []; }
      })(),
    ];

    // Merge results and deduplicate by event ID
    const allResults = (await Promise.all(fetches)).flat();
    const seen = new Set();
    const tmEvents = allResults.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    }).slice(0, 20); // Up to 20 real events

    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    return tmEvents.map((e) => {
      const venue = e._embedded?.venues?.[0] || {};
      const startLocal = e.dates?.start?.localDate || '';
      const startTime = e.dates?.start?.localTime || '';
      const priceMin = e.priceRanges?.[0]?.min;
      const priceMax = e.priceRanges?.[0]?.max;
      const priceStr = priceMin ? (priceMax && priceMax !== priceMin ? `$${priceMin} - $${priceMax}` : `$${priceMin}`) : 'See event';
      const img = e.images?.find(img => img.width >= 300)?.url || null;

      // Format date — parse localDate parts directly to avoid UTC offset shifting the day
      const [yyyy, mm, dd] = startLocal.split('-').map(Number);
      const dateStr = `${days[new Date(yyyy, mm - 1, dd).getDay()]}, ${months[mm - 1]} ${dd}`;

      // Format time
      let timeStr = '';
      if (startTime) {
        const [h, m] = startTime.split(':');
        const hour = parseInt(h);
        timeStr = `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
      }

      // Classify event for category filtering
      const classification = e.classifications?.[0] || {};
      const segment = classification.segment?.name?.toLowerCase() || '';
      const genre = classification.genre?.name?.toLowerCase() || '';
      let category = 'live';
      if (segment.includes('music')) category = 'music';
      else if (segment.includes('sport')) category = 'sports';
      else if (segment.includes('art') || genre.includes('comedy') || genre.includes('theatre')) category = 'arts';
      // Check if it's a food event specifically
      const titleLower = (e.name || '').toLowerCase();
      const isFoodEvent = /food|brunch|dinner|tasting|culinary|chef|bbq|taco|pizza|wine|beer|cocktail|market|festival.*food/.test(titleLower);
      if (isFoodEvent) category = 'food';

      return {
        id: `tm_${e.id}`,
        title: e.name,
        description: (e.info || e.pleaseNote || e.name || '').substring(0, 200),
        venue: venue.name || 'TBA',
        neighborhood: venue.city?.name || city.split(',')[0].trim(),
        city: city,
        date: dateStr,
        time: timeStr,
        price: priceStr,
        priceNum: priceMin || 0,
        category,
        vibe: isFoodEvent ? 'Food Event' : 'Live Event',
        emoji: isFoodEvent ? '🍽️' : (category === 'music' ? '🎵' : category === 'sports' ? '🏟️' : '🎟️'),
        image: img,
        premiumOnly: false,
        earlyAccess: false,
        tags: ['live', 'ticketmaster', ...(isFoodEvent ? ['food'] : []), category],
        source: 'Ticketmaster',
        url: e.url || null,
      };
    });
  } catch (err) {
    console.error('Ticketmaster fetch error:', err.message);
    return [];
  }
}

// ── FIRESTORE SCOUTED EVENTS ──
async function fetchScoutedEvents(city) {
  try {
    const now = new Date().toISOString();

    const snapshot = await db.collection('sabor_events')
      .where('city', '==', city)
      .where('expiresAt', '>', now)
      .orderBy('expiresAt')
      .limit(30)
      .get();

    if (snapshot.empty) return [];

    return snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id: d.id || doc.id,
        title: d.title,
        description: d.description || '',
        venue: d.venue,
        neighborhood: d.neighborhood || city.split(',')[0].trim(),
        city: d.city || city,
        date: d.date || '',
        time: d.time || '',
        price: d.price || 'See venue',
        priceNum: d.priceNum || 0,
        category: d.category || 'special',
        vibe: d.vibe || 'Food Event',
        emoji: d.emoji || '🍽️',
        image: d.image || null,
        premiumOnly: false,
        earlyAccess: false,
        tags: d.tags || ['food'],
        source: d.source || 'SABOR',
        url: d.url || null,
        recurring: d.recurring || false,
      };
    });
  } catch (err) {
    console.error('Firestore scout fetch error:', err.message);
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=1800');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAppKey(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { city = 'Chicago, IL', category, budget } = req.query;

  // Fetch from Ticketmaster + SABOR Scout (Firestore) in parallel
  // Note: Eventbrite search API was deprecated (404) — removed
  const [tmEvents, saborEvents] = await Promise.all([
    fetchTicketmasterEvents(city).catch(err => { console.error('TM failed:', err.message); return []; }),
    fetchScoutedEvents(city).catch(err => { console.error('Scout failed:', err.message); return []; }),
  ]);

  // Merge and deduplicate — SABOR scouted events first so they win dedup
  const seen = new Set();
  let events = [...saborEvents, ...tmEvents].filter(e => {
    const key = e.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Category filter
  if (category && category !== 'all') {
    events = events.filter(e => e.category === category || e.tags.includes(category));
  }

  // Budget filter
  if (budget) {
    const maxBudget = parseInt(budget);
    if (!isNaN(maxBudget)) {
      events = events.filter(e => e.priceNum <= maxBudget || e.priceNum === 0);
    }
  }

  // Sort: food events first, then chronologically
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  function parseDateStr(dateStr) {
    const match = dateStr?.match(/(\w+)\s+(\d+)$/);
    if (!match) return 99999;
    const monthIdx = months.indexOf(match[1]);
    const day = parseInt(match[2]);
    return monthIdx * 100 + day;
  }
  events.sort((a, b) => {
    const dateA = parseDateStr(a.date);
    const dateB = parseDateStr(b.date);
    if (dateA !== dateB) return dateA - dateB;
    // Food events first within same date
    const aFood = a.category === 'food' ? 0 : 1;
    const bFood = b.category === 'food' ? 0 : 1;
    return aFood - bFood;
  });

  return res.status(200).json({
    events,
    total: events.length,
    sources: { sabor: saborEvents.length, ticketmaster: tmEvents.length },
  });
}
