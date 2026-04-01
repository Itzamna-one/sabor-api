// api/scout-events.js — AI Event Scout (No external search API needed)
// Fetches public event listing pages directly, then uses Claude Haiku to extract
// real food events, happy hours, pop-ups, and festivals.
// Stores verified events in Firestore for the SABOR events feed.
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

// ── PUBLIC EVENT SOURCES ──
// Free, publicly accessible event listing pages with food/drink events in Chicago.
// No API keys needed — just fetch the HTML and let Claude parse it.
function getEventSources(city) {
  const cityName = city.split(',')[0].trim().toLowerCase();

  if (cityName === 'chicago') {
    return [
      {
        url: 'https://www.eventbrite.com/d/il--chicago/food-and-drink--events--this-week/',
        name: 'Eventbrite Food This Week',
      },
      {
        url: 'https://www.eventbrite.com/d/il--chicago/food-and-drink--events--next-week/',
        name: 'Eventbrite Food Next Week',
      },
      {
        url: 'https://www.eventbrite.com/d/il--chicago/food-festival/',
        name: 'Eventbrite Food Festivals',
      },
      {
        url: 'https://www.eventbrite.com/d/il--chicago/happy-hour/',
        name: 'Eventbrite Happy Hours',
      },
      {
        url: 'https://www.eventbrite.com/d/il--chicago/cooking-class/',
        name: 'Eventbrite Cooking Classes',
      },
      {
        url: 'https://www.eventbrite.com/d/il--chicago/wine-tasting/',
        name: 'Eventbrite Wine Tastings',
      },
      {
        url: 'https://do312.com/categories/food-drink',
        name: 'Do312 Food & Drink',
      },
      {
        url: 'https://www.choosechicago.com/events/food-drink/',
        name: 'Choose Chicago Food Events',
      },
    ];
  }

  if (cityName === 'indianapolis') {
    return [
      {
        url: 'https://www.eventbrite.com/d/in--indianapolis/food-and-drink--events--this-week/',
        name: 'Eventbrite Indy Food This Week',
      },
      {
        url: 'https://www.eventbrite.com/d/in--indianapolis/food-festival/',
        name: 'Eventbrite Indy Festivals',
      },
      {
        url: 'https://www.eventbrite.com/d/in--indianapolis/happy-hour/',
        name: 'Eventbrite Indy Happy Hours',
      },
    ];
  }

  // Generic fallback for other cities
  const stateAbbrev = city.includes('IL') ? 'il' : city.includes('IN') ? 'in' : 'il';
  return [
    {
      url: `https://www.eventbrite.com/d/${stateAbbrev}--${encodeURIComponent(cityName)}/food-and-drink--events--this-week/`,
      name: `Eventbrite ${cityName} Food`,
    },
  ];
}

// ── FETCH PAGE CONTENT ──
async function fetchPage(source) {
  try {
    const resp = await fetch(source.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });

    if (!resp.ok) {
      console.error(`Failed to fetch ${source.name}: ${resp.status}`);
      return null;
    }

    const html = await resp.text();

    // Extract text content — strip HTML tags but keep structure
    // Focus on event-relevant content, skip nav/footer/scripts
    let text = html
      // Remove scripts and styles
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, '')
      // Convert relevant tags to markers
      .replace(/<(h[1-6]|div|li|article|section|p)[^>]*>/gi, '\n---ITEM---\n')
      .replace(/<a[^>]*href="([^"]*)"[^>]*>/gi, ' [LINK:$1] ')
      .replace(/<time[^>]*datetime="([^"]*)"[^>]*>/gi, ' [DATE:$1] ')
      .replace(/<\/?(br|hr)[^>]*>/gi, '\n')
      // Strip remaining tags
      .replace(/<[^>]+>/g, ' ')
      // Clean up whitespace
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#\d+;/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ {2,}/g, ' ')
      .trim();

    // Truncate to ~12000 chars to stay within Claude's efficient range
    if (text.length > 12000) {
      text = text.substring(0, 12000) + '\n...[truncated]';
    }

    return { source: source.name, url: source.url, content: text };
  } catch (err) {
    console.error(`Fetch error for ${source.name}:`, err.message);
    return null;
  }
}

// ── CLAUDE EXTRACTION ──
async function extractEvents(pages, city) {
  if (!pages.length) return [];

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const cityName = city.split(',')[0].trim();
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const todayName = dayNames[today.getDay()];

  // Combine all page content into one prompt
  const pagesText = pages.map(p =>
    `\n=== SOURCE: ${p.source} (${p.url}) ===\n${p.content}`
  ).join('\n\n');

  const prompt = `You are an event data extractor for SABOR, a food discovery app in ${cityName}. Today is ${todayName}, ${dateStr}.

I've scraped several event listing websites. Extract ONLY real, verified food-related events happening THIS WEEK or NEXT WEEK. Include:
- Food festivals, pop-ups, tasting dinners, supper clubs
- Happy hours at specific restaurants/bars (recurring weekly counts!)
- Taco Tuesdays, Wine Wednesdays, themed food nights
- Food truck rallies, night markets, street food events
- Cooking classes, chef collaborations, prix fixe dinners
- Brunch events, bottomless specials, drag brunches with food
- Beer/wine/cocktail tasting events, brewery dinners
- Restaurant week promotions
- Latin food events, cultural food celebrations

STRICT RULES:
- ONLY extract events with a REAL venue name and a specific date or recurring day
- Each event MUST have enough detail to be useful (venue + date + what it is)
- NO generic articles, "top 10" lists, or blog posts — ONLY actual events
- NO events that already passed (before ${dateStr})
- NO duplicates
- For recurring events (happy hours, Taco Tuesday), set recurring: true
- Use [LINK:...] URLs from the content when available
- If a price is mentioned, include it; otherwise use "See venue"

SCRAPED PAGES:
${pagesText}

Respond ONLY with a valid JSON array (no markdown, no code fences, no explanation):
[
  {
    "title": "event name",
    "description": "1-2 sentences with specific food/drink details",
    "venue": "real venue name",
    "neighborhood": "neighborhood in ${cityName}",
    "date": "Day, Month Date" or "Every Tuesday" for recurring,
    "time": "start - end time" or "varies",
    "price": "$XX" or "Free" or "See venue",
    "category": "happy_hour" | "festival" | "pop_up" | "tasting" | "brunch" | "class" | "food_truck" | "special" | "market",
    "recurring": true/false,
    "recurringDay": "tuesday" (only if recurring),
    "url": "link to event page if found",
    "tags": ["relevant", "tags"],
    "confidence": "high" | "medium"
  }
]

Only include events with "high" or "medium" confidence. Return [] if nothing valid found.`;

  try {
    const message = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0]?.text || '[]';
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    }
    const events = JSON.parse(cleaned);
    console.log(`🎯 Claude extracted ${events.length} events`);
    return events;
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
      const targetDay = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(event.recurringDay.toLowerCase());
      if (targetDay >= 0) {
        const daysUntil = (targetDay - now.getDay() + 7) % 7;
        const nextDate = new Date(now);
        nextDate.setDate(now.getDate() + (daysUntil === 0 ? 0 : daysUntil));
        formattedDate = `${days[nextDate.getDay()]}, ${months[nextDate.getMonth()]} ${nextDate.getDate()}`;
      }
    }

    const emojiMap = {
      'happy_hour': '🍹', 'festival': '🎉', 'pop_up': '🔥', 'tasting': '🍷',
      'brunch': '🥂', 'class': '👨‍🍳', 'food_truck': '🌮', 'special': '⭐', 'market': '🏪',
    };

    const vibeMap = {
      'happy_hour': 'Happy Hour', 'brunch': 'Brunch', 'festival': 'Festival',
      'tasting': 'Tasting', 'class': 'Cooking Class', 'pop_up': 'Pop-Up',
      'food_truck': 'Food Trucks', 'market': 'Market', 'special': 'Food Event',
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
      vibe: vibeMap[event.category] || 'Food Event',
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

  console.log(`🔍 Event Scout starting for ${city}`);

  try {
    // Step 1: Get event source URLs for this city
    const sources = getEventSources(city);
    console.log(`📋 ${sources.length} event sources to scrape`);

    // Step 2: Fetch all pages in parallel (max 4 at a time)
    const allPages = [];
    for (let i = 0; i < sources.length; i += 4) {
      const batch = sources.slice(i, i + 4);
      const results = await Promise.all(batch.map(s => fetchPage(s)));
      allPages.push(...results.filter(Boolean));
    }
    console.log(`🌐 ${allPages.length} pages fetched successfully`);

    if (allPages.length === 0) {
      return res.status(200).json({
        success: true,
        city,
        searched: sources.length,
        fetched: 0,
        extracted: 0,
        stored: 0,
        cleaned: 0,
        events: [],
        note: 'No pages could be fetched — sources may be blocking requests',
      });
    }

    // Step 3: Extract events with Claude (send all pages at once for dedup)
    const events = await extractEvents(allPages, city);

    // Step 4: Store in Firestore
    const stored = await storeEvents(events, city);

    // Step 5: Cleanup expired events
    const cleaned = await cleanupExpired();

    return res.status(200).json({
      success: true,
      city,
      searched: sources.length,
      fetched: allPages.length,
      extracted: events.length,
      stored,
      cleaned,
      events: events.map(e => ({
        title: e.title,
        venue: e.venue,
        date: e.date,
        category: e.category,
        recurring: e.recurring || false,
      })),
    });
  } catch (err) {
    console.error('Scout error:', err);
    return res.status(500).json({ error: 'Scout failed', message: err.message });
  }
}
