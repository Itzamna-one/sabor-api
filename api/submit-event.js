// api/submit-event.js — Community Event Submission
// Anyone can submit. Claude Haiku screens for quality.
// Clean submissions → auto-approved into sabor_events.
// Sketchy ones → event_submissions (pending) for manual review.
//
// Supports: one-time, weekly, daily, monthly recurring events

import Anthropic from '@anthropic-ai/sdk';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { checkRateLimit, getClientIp, checkAppKey } from '../lib/sabor-security.js';

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── EMOJI MAP ──
const EMOJI_MAP = {
  'happy_hour': '🍹', 'festival': '🎉', 'pop_up': '🔥', 'tasting': '🍷',
  'brunch': '🥂', 'class': '👨‍🍳', 'food_truck': '🌮', 'special': '⭐',
  'market': '🏪', 'dinner': '🍽️', 'lunch': '🥘', 'live_music': '🎵',
};

// ── AI SCREENING ──
async function screenEvent(event) {
  try {
    const prompt = `You are a content moderator for SABOR, a food discovery app. Screen this user-submitted event for quality and safety.

EVENT:
Title: ${event.title}
Venue: ${event.venue}
Description: ${event.description || 'none'}
Food & Drink Highlights: ${event.foodHighlights || 'none provided'}
Category: ${event.category}
City: ${event.city}
Recurrence: ${event.recurrence}

APPROVE if:
- It's a legitimate food, drink, dining, or food-adjacent event (concerts at restaurants count)
- Title and description are coherent
- No hate speech, scams, or inappropriate content
- Venue name sounds real

REJECT if:
- Spam, gibberish, or test submissions
- Clearly inappropriate or offensive
- Not food/drink related at all (pure tech meetups, political rallies, etc.)
- Obvious fake venue name

Respond ONLY with valid JSON (no markdown):
{"approved": true/false, "reason": "1 sentence why", "suggestedCategory": "best category from: happy_hour, festival, pop_up, tasting, brunch, class, food_truck, special, market, dinner, lunch, live_music", "suggestedVibe": "best vibe: Festival, Tasting, Brunch, Cooking Class, Food Trucks, Market, Happy Hour, Pop-Up, Food Event, Live Music, Dinner Event"}`;

    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = msg.content[0]?.text || '{}';
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('AI screening failed:', e.message);
    // Fail open — send to pending review rather than blocking
    return { approved: false, reason: 'AI screening unavailable — queued for manual review', suggestedCategory: event.category, suggestedVibe: 'Food Event' };
  }
}

// ── BUILD DATE DISPLAY STRING ──
function buildDateDisplay(event) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (event.recurrence === 'once') {
    // Parse the date
    if (!event.date) return 'Date TBA';
    const d = new Date(event.date + 'T00:00:00');
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
  }

  if (event.recurrence === 'daily') {
    const selectedDays = (event.recurringDays || []).sort();
    if (selectedDays.length === 7) return 'Every day';
    if (selectedDays.length === 5 && !selectedDays.includes(0) && !selectedDays.includes(6)) return 'Mon - Fri';
    if (selectedDays.length === 2 && selectedDays.includes(0) && selectedDays.includes(6)) return 'Weekends';
    return selectedDays.map(d => shortDays[d]).join(', ');
  }

  if (event.recurrence === 'weekly') {
    const selectedDays = (event.recurringDays || []);
    if (selectedDays.length === 1) return `Every ${days[selectedDays[0]]}`;
    return selectedDays.map(d => `${days[d]}s`).join(' & ');
  }

  if (event.recurrence === 'monthly') {
    return event.monthlyPattern || 'Monthly';
  }

  return 'Ongoing';
}

// ── BUILD TIME DISPLAY STRING ──
function buildTimeDisplay(event) {
  if (!event.startTime) return '';
  const fmt = (t) => {
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
  };
  if (event.endTime) return `${fmt(event.startTime)} - ${fmt(event.endTime)}`;
  return fmt(event.startTime);
}

// ── HANDLER ──
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sabor-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAppKey(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // ── Rate limit: 5 submissions per IP per hour ─────────────────────────────
  const clientIp = getClientIp(req);
  const rl = await checkRateLimit(clientIp, 'submit-event', 5, 60 * 60_000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too many submissions. Please wait before submitting again.', retryAfter: rl.retryAfter });
  }
  // ─────────────────────────────────────────────────────────────────────────

  const {
    title, venue, description = '', address = '',
    city = 'Chicago, IL', neighborhood = '',
    category = 'special',
    recurrence = 'once',        // 'once' | 'weekly' | 'daily' | 'monthly'
    recurringDays = [],          // [0-6] Sun=0 ... Sat=6
    monthlyPattern = '',         // "First Friday", "Last Saturday", etc.
    date = '',                   // for one-time events: "2026-04-15"
    startTime = '',              // "16:00"
    endTime = '',                // "19:00"
    price = 'Free',
    foodHighlights = '',
    image = null,
    tags = [],
    submitterName = '',
    submitterEmail = '',
    submitterUid = '',
    isVenue = false,             // true if submitter claims to be the venue
    language = 'en',
  } = req.body;

  // Validation
  if (!title || title.length < 3) return res.status(400).json({ error: 'Title is required (min 3 chars)' });
  if (!venue || venue.length < 2) return res.status(400).json({ error: 'Venue name is required' });
  if (recurrence === 'once' && !date) return res.status(400).json({ error: 'Date is required for one-time events' });
  if ((recurrence === 'weekly' || recurrence === 'daily') && recurringDays.length === 0) {
    return res.status(400).json({ error: 'Select at least one day for recurring events' });
  }

  // Build display strings
  const dateDisplay = buildDateDisplay({ recurrence, date, recurringDays, monthlyPattern });
  const timeDisplay = buildTimeDisplay({ startTime, endTime });

  // AI screening
  const screening = await screenEvent({ title, venue, description, foodHighlights, category, city, recurrence });

  const now = new Date();
  const isRecurring = recurrence !== 'once';

  // TTL: one-time → expires day after event. Recurring → 90 days.
  let expiresAt;
  if (isRecurring) {
    expiresAt = new Date(now.getTime() + 90 * 86400000).toISOString();
  } else {
    const eventDate = new Date(date + 'T23:59:59');
    expiresAt = new Date(eventDate.getTime() + 86400000).toISOString(); // day after
  }

  const finalCategory = screening.suggestedCategory || category;
  const finalVibe = screening.suggestedVibe || 'Food Event';

  // Build stable doc ID
  const idBase = `${title}_${venue}`.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);

  const eventDoc = {
    title,
    venue,
    description,
    foodHighlights: foodHighlights || '',
    address,
    city,
    neighborhood: neighborhood || city.split(',')[0].trim(),
    category: finalCategory,
    vibe: finalVibe,
    emoji: EMOJI_MAP[finalCategory] || '🍽️',
    recurrence,
    recurringDays: isRecurring ? recurringDays : [],
    monthlyPattern: recurrence === 'monthly' ? monthlyPattern : '',
    date: dateDisplay,
    time: timeDisplay,
    price: price || 'Free',
    priceNum: parseInt((price || '').replace(/[^0-9]/g, '')) || 0,
    image: image || null,
    tags: [...(tags || []), 'food', 'community', finalCategory].filter(Boolean),
    source: 'community',
    recurring: isRecurring,
    premiumOnly: false,
    earlyAccess: false,
    // Submission metadata
    submitterName,
    submitterEmail,
    submitterUid,
    isVenue,
    verified: false,
    // Status
    status: screening.approved ? 'approved' : 'pending',
    screeningReason: screening.reason,
    submittedAt: now.toISOString(),
    expiresAt,
  };

  try {
    if (screening.approved) {
      // Auto-approved → goes straight to sabor_events (live feed)
      const docId = `community_${idBase}`;
      await db.collection('sabor_events').doc(docId).set({
        id: docId,
        ...eventDoc,
        scoutedAt: now.toISOString(),
      }, { merge: true });

      return res.status(200).json({
        success: true,
        status: 'approved',
        message: language === 'en'
          ? 'Your event is live! 🎉'
          : '¡Tu evento ya está en vivo! 🎉',
        eventId: docId,
      });
    } else {
      // Needs review → event_submissions collection
      const docId = `pending_${idBase}`;
      await db.collection('event_submissions').doc(docId).set({
        id: docId,
        ...eventDoc,
      });

      return res.status(200).json({
        success: true,
        status: 'pending',
        message: language === 'en'
          ? 'Thanks! Your event is under review and will be live soon.'
          : '¡Gracias! Tu evento está en revisión y estará disponible pronto.',
        eventId: docId,
      });
    }
  } catch (err) {
    console.error('Submit event error:', err);
    return res.status(500).json({ error: 'Failed to save event', message: err.message });
  }
}
