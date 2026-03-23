const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

// Dynamic dates helper
function getUpcomingDay(targetDay, weeksAhead = 0) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today = new Date();
  let daysUntil = (targetDay - today.getDay() + 7) % 7;
  if (daysUntil === 0) daysUntil = 7;
  const d = new Date(today);
  d.setDate(today.getDate() + daysUntil + (weeksAhead * 7));
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

// Curated SABOR events - always shown
const SABOR_EVENTS = [
  {
    id: 'evt_001',
    title: 'Reggaeton Brunch',
    description: 'Start your Sunday right with bottomless mimosas, live DJ, and authentic Latin brunch bites.',
    venue: 'La Palapa Chicago',
    neighborhood: 'Pilsen',
    city: 'Chicago, IL',
    date: getUpcomingDay(0),
    time: '11:00 AM - 3:00 PM',
    price: '$35',
    priceNum: 35,
    category: 'brunch',
    vibe: 'Social · Music',
    emoji: '🎵',
    image: null,
    premiumOnly: false,
    earlyAccess: true,
    tags: ['music', 'brunch', 'latino', 'social'],
    source: 'SABOR'
  },
  {
    id: 'evt_002',
    title: 'Taco & Mezcal Pairing Night',
    description: 'Exclusive premium tasting — 5 artisanal tacos paired with rare Oaxacan mezcals. Limited to 40 guests.',
    venue: 'Cantina Diablo',
    neighborhood: 'Logan Square',
    city: 'Chicago, IL',
    date: getUpcomingDay(5),
    time: '7:00 PM - 10:00 PM',
    price: '$65',
    priceNum: 65,
    category: 'dinner',
    vibe: 'Exclusive · Intimate',
    emoji: '🌮',
    image: null,
    premiumOnly: true,
    earlyAccess: true,
    tags: ['tacos', 'mezcal', 'exclusive', 'premium'],
    source: 'SABOR'
  },
  {
    id: 'evt_003',
    title: 'Latin Street Food Festival',
    description: '20+ vendors, live cumbia band, and the best street food from Mexico, Colombia, Puerto Rico and beyond.',
    venue: 'Humboldt Park',
    neighborhood: 'Humboldt Park',
    city: 'Chicago, IL',
    date: getUpcomingDay(6),
    time: '12:00 PM - 8:00 PM',
    price: 'Free',
    priceNum: 0,
    category: 'festival',
    vibe: 'Family · Community',
    emoji: '🎉',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['free', 'festival', 'family', 'street food'],
    source: 'SABOR'
  },
  {
    id: 'evt_004',
    title: 'Hidden Gem Supper Club',
    description: 'SABOR Premium exclusive — dinner at a secret location revealed 24hrs before. Chef-driven 5-course Latin fusion.',
    venue: 'Secret Location — Revealed 24hrs Before',
    neighborhood: 'Little Village',
    city: 'Chicago, IL',
    date: getUpcomingDay(6, 1),
    time: '7:30 PM - 11:00 PM',
    price: '$85',
    priceNum: 85,
    category: 'dinner',
    vibe: 'Premium · Secret',
    emoji: '💎',
    image: null,
    premiumOnly: true,
    earlyAccess: true,
    tags: ['exclusive', 'premium', 'supper club', 'fusion'],
    source: 'SABOR'
  },
  {
    id: 'evt_005',
    title: 'Café de Olla Morning',
    description: 'Slow mornings done right — traditional café de olla, pan dulce, and live acoustic guitar in a cozy Wicker Park café.',
    venue: 'Café Corazón',
    neighborhood: 'Wicker Park',
    city: 'Chicago, IL',
    date: getUpcomingDay(0),
    time: '8:00 AM - 11:00 AM',
    price: '$15',
    priceNum: 15,
    category: 'morning',
    vibe: 'Chill · Cozy',
    emoji: '☕',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['coffee', 'morning', 'chill', 'music'],
    source: 'SABOR'
  },
  {
    id: 'evt_006',
    title: 'Happy Hour Taco Crawl',
    description: '4 stops, 4 neighborhoods, happy hour deals at each. $3 tacos, $5 margaritas. SABOR guides the route.',
    venue: 'Multiple Locations',
    neighborhood: 'Pilsen → Little Village → Back of the Yards',
    city: 'Chicago, IL',
    date: getUpcomingDay(4),
    time: '4:00 PM - 8:00 PM',
    price: '$20 suggested',
    priceNum: 20,
    category: 'happyhour',
    vibe: 'Fun · Social',
    emoji: '🔥',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['tacos', 'happy hour', 'crawl', 'social'],
    source: 'SABOR'
  },
  {
    id: 'evt_007',
    title: 'Birria & Beats',
    description: 'The best birria in Chicago paired with live DJ sets. Bottomless consommé. Cash bar. Vibes all night.',
    venue: 'La Villita Cultural Center',
    neighborhood: 'Little Village',
    city: 'Chicago, IL',
    date: getUpcomingDay(6),
    time: '6:00 PM - 11:00 PM',
    price: '$25',
    priceNum: 25,
    category: 'dinner',
    vibe: 'Music · Food',
    emoji: '🎶',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['birria', 'music', 'social', 'latino'],
    source: 'SABOR'
  },
  {
    id: 'evt_008',
    title: 'Vegan Latinx Food Market',
    description: 'Plant-based Latin food vendors, cooking demos, and live music. Free entry. All are welcome.',
    venue: 'Logan Square Farmers Market',
    neighborhood: 'Logan Square',
    city: 'Chicago, IL',
    date: getUpcomingDay(0),
    time: '10:00 AM - 4:00 PM',
    price: 'Free',
    priceNum: 0,
    category: 'festival',
    vibe: 'Community · Healthy',
    emoji: '🌱',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['vegan', 'market', 'free', 'community'],
    source: 'SABOR'
  },
  {
    id: 'evt_009',
    title: 'Pozole & Pulque Night',
    description: 'Traditional pozole rojo and blanco served with rare pulque varieties. A taste of real Mexico City nightlife.',
    venue: 'El Barrio Chicago',
    neighborhood: 'Pilsen',
    city: 'Chicago, IL',
    date: getUpcomingDay(5),
    time: '7:00 PM - 12:00 AM',
    price: '$30',
    priceNum: 30,
    category: 'dinner',
    vibe: 'Authentic · Festive',
    emoji: '🍲',
    image: null,
    premiumOnly: false,
    earlyAccess: true,
    tags: ['pozole', 'pulque', 'authentic', 'mexican'],
    source: 'SABOR'
  },
  {
    id: 'evt_010',
    title: 'Chef Table: Latin Fusion',
    description: 'Intimate 10-person chef table experience. 8-course Latin fusion tasting menu. Wine pairings included.',
    venue: 'Private Kitchen — River North',
    neighborhood: 'River North',
    city: 'Chicago, IL',
    date: getUpcomingDay(3),
    time: '7:00 PM - 10:30 PM',
    price: '$120',
    priceNum: 120,
    category: 'dinner',
    vibe: 'Premium · Intimate',
    emoji: '👨‍🍳',
    image: null,
    premiumOnly: true,
    earlyAccess: true,
    tags: ['chef table', 'fusion', 'premium', 'exclusive'],
    source: 'SABOR'
  },
  {
    id: 'evt_011',
    title: 'Salsa Night & Tapas',
    description: 'Learn salsa from a pro, then eat. Live band, tapas from 5 Latin countries, open bar.',
    venue: 'Casa Salsa Chicago',
    neighborhood: 'Wicker Park',
    city: 'Chicago, IL',
    date: getUpcomingDay(5),
    time: '8:00 PM - 1:00 AM',
    price: '$40',
    priceNum: 40,
    category: 'dinner',
    vibe: 'Dance · Social',
    emoji: '💃',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['salsa', 'dancing', 'tapas', 'social'],
    source: 'SABOR'
  },
  {
    id: 'evt_012',
    title: 'Elote & Antojitos Pop-Up',
    description: 'Street food pop-up featuring Chicago\'s best elote vendors, tamale ladies, and paleteros. All in one spot.',
    venue: 'Pilsen Community Garden',
    neighborhood: 'Pilsen',
    city: 'Chicago, IL',
    date: getUpcomingDay(6),
    time: '2:00 PM - 7:00 PM',
    price: 'Free entry',
    priceNum: 0,
    category: 'festival',
    vibe: 'Street Food · Family',
    emoji: '🌽',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['elote', 'street food', 'free', 'family', 'antojitos'],
    source: 'SABOR'
  },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=3600');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { city = 'Chicago, IL', category, budget } = req.query;

  let events = SABOR_EVENTS.filter(e =>
    e.city.toLowerCase().includes(city.split(',')[0].toLowerCase())
  );

  if (category && category !== 'all') {
    events = events.filter(e => e.category === category || e.tags.includes(category));
  }

  if (budget) {
    const maxBudget = parseInt(budget);
    events = events.filter(e => e.priceNum <= maxBudget);
  }

  return res.status(200).json({ events, total: events.length });
}
