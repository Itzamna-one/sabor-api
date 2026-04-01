// api/events.js — Real events via Ticketmaster + Eventbrite APIs
// No curated/fake events — only verified, real events users can actually attend.

// City → lat/lng for Eventbrite location search
const CITY_COORDS = {
  'chicago':       { lat: 41.8781, lng: -87.6298 },
  'indianapolis':  { lat: 39.7684, lng: -86.1581 },
  'aurora':        { lat: 41.7606, lng: -88.3201 },
  'naperville':    { lat: 41.7508, lng: -88.1535 },
  'joliet':        { lat: 41.5250, lng: -88.0817 },
  'rockford':      { lat: 42.2711, lng: -89.0940 },
  'springfield':   { lat: 39.7817, lng: -89.6501 },
  'gary':          { lat: 41.5934, lng: -87.3465 },
  'fort wayne':    { lat: 41.0793, lng: -85.1394 },
  'south bend':    { lat: 41.6764, lng: -86.2520 },
  'bloomington':   { lat: 39.1653, lng: -86.5264 },
};

// ── EVENTBRITE API ──
async function fetchEventbriteEvents(city) {
  const token = process.env.EVENTBRITE_API_TOKEN;
  if (!token) return [];

  try {
    const cityName = city.split(',')[0].trim().toLowerCase();
    const coords = CITY_COORDS[cityName] || CITY_COORDS['chicago'];

    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    // Search food-related events within 25 miles
    const searches = [
      'food+festival', 'taco', 'tasting+dinner', 'food+truck',
      'night+market', 'cooking+class', 'brunch', 'pop+up+restaurant',
    ];

    // Run 2 parallel searches (to stay within rate limits)
    const fetches = [
      (async () => {
        try {
          const url = `https://www.eventbriteapi.com/v3/events/search/?q=${searches.slice(0, 4).join('+')}&location.latitude=${coords.lat}&location.longitude=${coords.lng}&location.within=25mi&expand=venue&sort_by=date&page_size=12`;
          const resp = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: AbortSignal.timeout(6000),
          });
          if (!resp.ok) { console.error('Eventbrite search 1:', resp.status); return []; }
          const data = await resp.json();
          return data?.events || [];
        } catch { return []; }
      })(),
      (async () => {
        try {
          const url = `https://www.eventbriteapi.com/v3/events/search/?q=${searches.slice(4).join('+')}&location.latitude=${coords.lat}&location.longitude=${coords.lng}&location.within=25mi&expand=venue&sort_by=date&page_size=8`;
          const resp = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: AbortSignal.timeout(6000),
          });
          if (!resp.ok) { console.error('Eventbrite search 2:', resp.status); return []; }
          const data = await resp.json();
          return data?.events || [];
        } catch { return []; }
      })(),
    ];

    const allResults = (await Promise.all(fetches)).flat();
    const seen = new Set();
    const events = allResults.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    }).slice(0, 12);

    return events.map(e => {
      const venueName = e.venue?.name || 'TBA';
      const venueCity = e.venue?.address?.city || city.split(',')[0].trim();
      const startUtc = e.start?.local || '';
      const eventDate = startUtc ? new Date(startUtc) : new Date();
      const dateStr = `${days[eventDate.getDay()]}, ${months[eventDate.getMonth()]} ${eventDate.getDate()}`;
      const hour = eventDate.getHours();
      const min = String(eventDate.getMinutes()).padStart(2, '0');
      const timeStr = startUtc ? `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:${min} ${hour >= 12 ? 'PM' : 'AM'}` : '';

      const isFree = e.is_free || false;
      const img = e.logo?.url || null;
      const titleLower = (e.name?.text || '').toLowerCase();
      const isFoodEvent = /food|brunch|dinner|tasting|culinary|chef|bbq|taco|pizza|wine|beer|cocktail|market|pop.?up|cooking/.test(titleLower);

      return {
        id: `eb_${e.id}`,
        title: e.name?.text || 'Event',
        description: (e.description?.text || e.summary || '').substring(0, 200),
        venue: venueName,
        neighborhood: venueCity,
        city,
        date: dateStr,
        time: timeStr,
        price: isFree ? 'Free' : 'See event',
        priceNum: 0,
        category: isFoodEvent ? 'food' : 'live',
        vibe: isFoodEvent ? 'Food Event' : 'Experience',
        emoji: isFoodEvent ? '🍽️' : '🎫',
        image: img,
        premiumOnly: false,
        earlyAccess: false,
        tags: ['live', 'eventbrite', ...(isFoodEvent ? ['food'] : [])],
        source: 'Eventbrite',
        url: e.url || null,
      };
    });
  } catch (err) {
    console.error('Eventbrite fetch error:', err.message);
    return [];
  }
}

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

      // Format date — always "DayName, Month Date" (client adds "Today" label locally)
      const eventDate = new Date(startLocal + 'T' + (startTime || '00:00:00'));
      const dateStr = `${days[eventDate.getDay()]}, ${months[eventDate.getMonth()]} ${eventDate.getDate()}`;

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=1800');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { city = 'Chicago, IL', category, budget } = req.query;

  // Fetch from both APIs in parallel
  const [tmEvents, ebEvents] = await Promise.all([
    fetchTicketmasterEvents(city).catch(err => { console.error('TM failed:', err.message); return []; }),
    fetchEventbriteEvents(city).catch(err => { console.error('EB failed:', err.message); return []; }),
  ]);

  // Merge and deduplicate (by title similarity — same event listed on both platforms)
  const seen = new Set();
  let events = [...ebEvents, ...tmEvents].filter(e => {
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
    sources: { ticketmaster: tmEvents.length, eventbrite: ebEvents.length },
  });
}
