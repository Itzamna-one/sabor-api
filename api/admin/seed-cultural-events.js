// api/admin/seed-cultural-events.js
// One-time seed for recurring annual Latin/cultural events.
// POST with X-API-Secret header. Idempotent — safe to re-run each January.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

function getCulturalEvents(year) {
  return [
    // ── CHICAGO ──
    {
      id: `cultural_chicago_reyesbrunz_${year}`,
      title: 'Día de Reyes — Three Kings Day',
      description: 'Chicago\'s Latino communities celebrate Three Kings Day with tamales, atole, and rosca de reyes. The real start of the holiday season.',
      venue: 'Pilsen Community / Various',
      neighborhood: 'Pilsen',
      city: 'Chicago, IL',
      date: 'Wednesday, January 6',
      time: 'All day',
      price: 'Free',
      priceNum: 0,
      category: 'special',
      vibe: 'Cultural Celebration',
      emoji: '👑',
      tags: ['cultural', 'food', 'holiday', 'latino', 'tamales'],
    },
    {
      id: `cultural_chicago_cincodemayo_pilsen_${year}`,
      title: 'Cinco de Mayo Festival — Pilsen',
      description: 'Pilsen\'s annual Cinco de Mayo block party with street tacos, aguas frescas, live music, and local vendors. One of Chicago\'s biggest Latino celebrations.',
      venue: '18th Street, Pilsen',
      neighborhood: 'Pilsen',
      city: 'Chicago, IL',
      date: 'Saturday, May 2',
      time: '12:00 PM',
      price: 'Free',
      priceNum: 0,
      category: 'festival',
      vibe: 'Festival',
      emoji: '🎉',
      tags: ['festival', 'food', 'cinco de mayo', 'latino', 'tacos', 'street food'],
    },
    {
      id: `cultural_chicago_cincodemayo_lv_${year}`,
      title: 'Cinco de Mayo — Little Village',
      description: 'Little Village celebrates with a full street festival: tamale vendors, food trucks, traditional dancers, and family activities along 26th Street.',
      venue: '26th Street, Little Village',
      neighborhood: 'Little Village',
      city: 'Chicago, IL',
      date: 'Sunday, May 3',
      time: '11:00 AM',
      price: 'Free',
      priceNum: 0,
      category: 'festival',
      vibe: 'Festival',
      emoji: '🌮',
      tags: ['festival', 'food', 'cinco de mayo', 'latino', 'little village'],
    },
    {
      id: `cultural_chicago_mothersday_${year}`,
      title: 'Mother\'s Day Brunch Season',
      description: 'Every Mexican and Latin restaurant in Chicago does something special for Mother\'s Day. Book early — the best spots fill up fast.',
      venue: 'Various restaurants citywide',
      neighborhood: 'Citywide',
      city: 'Chicago, IL',
      date: 'Sunday, May 10',
      time: '10:00 AM',
      price: 'Varies',
      priceNum: 0,
      category: 'brunch',
      vibe: 'Brunch',
      emoji: '🥂',
      tags: ['brunch', 'mothers day', 'food', 'family', 'latino'],
    },
    {
      id: `cultural_chicago_juneteenth_${year}`,
      title: 'Juneteenth Food & Culture Fest',
      description: 'Chicago\'s Juneteenth celebration brings together Black and Latino food traditions — BBQ, elotes, soul food, and live music in Bronzeville.',
      venue: 'Bronzeville / Washington Park',
      neighborhood: 'Bronzeville',
      city: 'Chicago, IL',
      date: 'Friday, June 19',
      time: '12:00 PM',
      price: 'Free',
      priceNum: 0,
      category: 'festival',
      vibe: 'Festival',
      emoji: '🎶',
      tags: ['festival', 'food', 'juneteenth', 'culture', 'bbq'],
    },
    {
      id: `cultural_chicago_lvsummerfest_${year}`,
      title: 'Little Village Summer Fiesta',
      description: 'The biggest summer street festival in Chicago\'s Mexican community. Food vendors, live banda, lotería, and the best street food on 26th Street.',
      venue: '26th Street, Little Village',
      neighborhood: 'Little Village',
      city: 'Chicago, IL',
      date: 'Saturday, August 15',
      time: '11:00 AM',
      price: 'Free',
      priceNum: 0,
      category: 'festival',
      vibe: 'Festival',
      emoji: '🌶️',
      tags: ['festival', 'food', 'summer', 'little village', 'latino', 'street food'],
    },
    {
      id: `cultural_chicago_fiestapatrias_${year}`,
      title: 'Fiestas Patrias Parade & Festival — Pilsen',
      description: 'Chicago\'s Mexican Independence Day celebration. Parade down 18th Street, followed by a festival with traditional food, music, and culture.',
      venue: '18th Street, Pilsen',
      neighborhood: 'Pilsen',
      city: 'Chicago, IL',
      date: 'Saturday, September 12',
      time: '10:00 AM',
      price: 'Free',
      priceNum: 0,
      category: 'festival',
      vibe: 'Cultural Celebration',
      emoji: '🇲🇽',
      tags: ['festival', 'fiestas patrias', 'independence day', 'food', 'latino', 'pilsen'],
    },
    {
      id: `cultural_chicago_ddlm_pilsen_${year}`,
      title: 'Día de los Muertos — Pilsen',
      description: 'Pilsen transforms into the largest Día de los Muertos celebration outside Mexico. Altars, marigolds, traditional food, and art exhibitions throughout the neighborhood.',
      venue: 'National Museum of Mexican Art & 18th Street',
      neighborhood: 'Pilsen',
      city: 'Chicago, IL',
      date: 'Sunday, November 1',
      time: 'All day',
      price: 'Free',
      priceNum: 0,
      category: 'festival',
      vibe: 'Cultural Celebration',
      emoji: '🌸',
      tags: ['dia de los muertos', 'cultural', 'food', 'art', 'latino', 'pilsen'],
    },
    {
      id: `cultural_chicago_ddlm_logansquare_${year}`,
      title: 'Día de los Muertos — Logan Square',
      description: 'Logan Square\'s Día de los Muertos celebration features community altars, traditional pan de muerto, and a candlelit procession through the neighborhood.',
      venue: 'Logan Square',
      neighborhood: 'Logan Square',
      city: 'Chicago, IL',
      date: 'Sunday, November 1',
      time: '5:00 PM',
      price: 'Free',
      priceNum: 0,
      category: 'special',
      vibe: 'Cultural Celebration',
      emoji: '🕯️',
      tags: ['dia de los muertos', 'cultural', 'food', 'community', 'logan square'],
    },
    {
      id: `cultural_chicago_guadalupe_${year}`,
      title: 'Virgen de Guadalupe Celebration',
      description: 'December 12 is celebrated across Chicago\'s Mexican neighborhoods. Mañanitas at dawn, tamales, atole, and community gatherings throughout the day.',
      venue: 'St. Pius V Parish and surrounding Pilsen',
      neighborhood: 'Pilsen',
      city: 'Chicago, IL',
      date: 'Saturday, December 12',
      time: '6:00 AM',
      price: 'Free',
      priceNum: 0,
      category: 'special',
      vibe: 'Cultural Celebration',
      emoji: '🌹',
      tags: ['guadalupe', 'cultural', 'tamales', 'atole', 'community', 'pilsen'],
    },
    {
      id: `cultural_chicago_nochebuena_${year}`,
      title: 'Nochebuena Tamale Night',
      description: 'Christmas Eve in Little Village means tamales — families line up at panaderías and taquerías that stay open late. The neighborhood is electric on December 24.',
      venue: 'Little Village / Pilsen',
      neighborhood: 'Little Village',
      city: 'Chicago, IL',
      date: 'Thursday, December 24',
      time: 'Evening',
      price: 'Varies',
      priceNum: 0,
      category: 'special',
      vibe: 'Food Event',
      emoji: '🫔',
      tags: ['nochebuena', 'tamales', 'holiday', 'christmas', 'little village', 'food'],
    },
    // ── INDIANAPOLIS ──
    {
      id: `cultural_indy_cincodemayo_${year}`,
      title: 'Cinco de Mayo — West Washington St Festival',
      description: 'Indianapolis\'s Mexican community celebrates along West Washington Street with food vendors, folklórico dancing, and live music.',
      venue: 'West Washington Street',
      neighborhood: 'West Washington St',
      city: 'Indianapolis, IN',
      date: 'Sunday, May 3',
      time: '12:00 PM',
      price: 'Free',
      priceNum: 0,
      category: 'festival',
      vibe: 'Festival',
      emoji: '🎉',
      tags: ['festival', 'cinco de mayo', 'food', 'latino', 'indianapolis'],
    },
    {
      id: `cultural_indy_fiestapatrias_${year}`,
      title: 'Fiestas Patrias — Indianapolis',
      description: 'Indianapolis celebrates Mexican Independence Day with a festival on West Washington Street — the heart of the city\'s Latino community.',
      venue: 'West Washington Street',
      neighborhood: 'West Washington St',
      city: 'Indianapolis, IN',
      date: 'Saturday, September 12',
      time: '11:00 AM',
      price: 'Free',
      priceNum: 0,
      category: 'festival',
      vibe: 'Cultural Celebration',
      emoji: '🇲🇽',
      tags: ['fiestas patrias', 'festival', 'food', 'latino', 'indianapolis'],
    },
    // ── AURORA ──
    {
      id: `cultural_aurora_cincodemayo_${year}`,
      title: 'Cinco de Mayo — Aurora Latin District',
      description: 'Aurora\'s downtown Latin district hosts one of the biggest Cinco de Mayo celebrations in the suburbs — street food, live music, and thousands of attendees.',
      venue: 'Downtown Aurora / Galena Blvd',
      neighborhood: 'Downtown Aurora',
      city: 'Aurora, IL',
      date: 'Saturday, May 2',
      time: '12:00 PM',
      price: 'Free',
      priceNum: 0,
      category: 'festival',
      vibe: 'Festival',
      emoji: '🌮',
      tags: ['festival', 'cinco de mayo', 'food', 'latino', 'aurora'],
    },
    {
      id: `cultural_aurora_fiestapatrias_${year}`,
      title: 'Fiestas Patrias — Aurora',
      description: 'Aurora\'s Mexican Independence Day celebration brings the city\'s large Latino community together along the Fox River downtown.',
      venue: 'Downtown Aurora',
      neighborhood: 'Downtown Aurora',
      city: 'Aurora, IL',
      date: 'Saturday, September 12',
      time: '11:00 AM',
      price: 'Free',
      priceNum: 0,
      category: 'festival',
      vibe: 'Cultural Celebration',
      emoji: '🇲🇽',
      tags: ['fiestas patrias', 'festival', 'food', 'latino', 'aurora'],
    },
    // ── WAUKEGAN ──
    {
      id: `cultural_waukegan_latinofest_${year}`,
      title: 'Taste of Latin America — Waukegan',
      description: 'Waukegan\'s annual Latino food festival celebrates the diversity of Latin American cuisine — Mexican, Puerto Rican, Colombian, and more.',
      venue: 'Downtown Waukegan',
      neighborhood: 'Downtown Waukegan',
      city: 'Waukegan, IL',
      date: 'Saturday, August 15',
      time: '12:00 PM',
      price: 'Free',
      priceNum: 0,
      category: 'festival',
      vibe: 'Festival',
      emoji: '🎉',
      tags: ['festival', 'food', 'latino', 'waukegan', 'multicultural'],
    },
    // ── ELGIN ──
    {
      id: `cultural_elgin_latinoheritage_${year}`,
      title: 'Elgin Latino Heritage Festival',
      description: 'Elgin\'s annual celebration of Latino culture during Hispanic Heritage Month, featuring food vendors, traditional music, and dance performances.',
      venue: 'Festival Park, Downtown Elgin',
      neighborhood: 'Downtown Elgin',
      city: 'Elgin, IL',
      date: 'Saturday, September 12',
      time: '11:00 AM',
      price: 'Free',
      priceNum: 0,
      category: 'festival',
      vibe: 'Festival',
      emoji: '🌶️',
      tags: ['festival', 'food', 'latino', 'elgin', 'heritage'],
    },
    // ── BERWYN ──
    {
      id: `cultural_berwyn_latinostreetfest_${year}`,
      title: 'Berwyn Latin Street Fest',
      description: 'Berwyn\'s Cermak Road comes alive with a summer street festival celebrating the neighborhood\'s Latino community — street tacos, live bands, and family fun.',
      venue: 'Cermak Road, Berwyn',
      neighborhood: 'Cermak Road',
      city: 'Berwyn, IL',
      date: 'Saturday, July 4',
      time: '12:00 PM',
      price: 'Free',
      priceNum: 0,
      category: 'festival',
      vibe: 'Festival',
      emoji: '🎶',
      tags: ['festival', 'food', 'latino', 'berwyn', 'summer'],
    },
    // ── JOLIET ──
    {
      id: `cultural_joliet_mexindependence_${year}`,
      title: 'Mexican Independence Day — Joliet',
      description: 'Joliet\'s Mexican community celebrates Independence Day with a festival in downtown, featuring traditional food, music, and cultural performances.',
      venue: 'Downtown Joliet',
      neighborhood: 'Downtown Joliet',
      city: 'Joliet, IL',
      date: 'Saturday, September 12',
      time: '11:00 AM',
      price: 'Free',
      priceNum: 0,
      category: 'festival',
      vibe: 'Cultural Celebration',
      emoji: '🇲🇽',
      tags: ['festival', 'independence day', 'food', 'latino', 'joliet'],
    },
    // ── CICERO ──
    {
      id: `cultural_cicero_cincodemayo_${year}`,
      title: 'Cinco de Mayo — Cicero',
      description: 'Cicero\'s predominantly Mexican community celebrates Cinco de Mayo with a neighborhood festival, street food vendors, and live music on Cermak Avenue.',
      venue: 'Cermak Avenue, Cicero',
      neighborhood: 'Cermak Ave',
      city: 'Cicero, IL',
      date: 'Sunday, May 3',
      time: '12:00 PM',
      price: 'Free',
      priceNum: 0,
      category: 'festival',
      vibe: 'Festival',
      emoji: '🌮',
      tags: ['festival', 'cinco de mayo', 'food', 'latino', 'cicero'],
    },
  ];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const secret = req.headers['x-api-secret'];
  if (secret !== process.env.NOTIFY_API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Compute at invocation time, not module load
  const year = new Date().getFullYear();
  const expiry = `${year}-12-31T23:59:59.000Z`;
  const now = new Date().toISOString();
  const CULTURAL_EVENTS = getCulturalEvents(year);

  const collection = db.collection('sabor_events');
  const batch = db.batch();
  let seeded = 0;
  let skipped = 0;

  for (const event of CULTURAL_EVENTS) {
    const existing = await collection.doc(event.id).get();
    if (existing.exists) {
      skipped++;
      continue;
    }
    batch.set(collection.doc(event.id), {
      ...event,
      image: null,
      premiumOnly: false,
      earlyAccess: false,
      source: 'SABOR Cultural',
      recurring: true,
      scoutedAt: now,
      expiresAt: expiry,
    });
    seeded++;
  }

  await batch.commit();

  return res.status(200).json({
    success: true,
    total: CULTURAL_EVENTS.length,
    seeded,
    skipped,
    expiry,
  });
}
