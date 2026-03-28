// api/events.js — Dynamic events with upcoming dates

// Dynamic dates helper — includes today if the day matches
function getUpcomingDay(targetDay, weeksAhead = 0) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today = new Date();
  let daysUntil = (targetDay - today.getDay() + 7) % 7;
  // daysUntil === 0 means today IS the target day — show it today, not next week
  const d = new Date(today);
  d.setDate(today.getDate() + daysUntil + (weeksAhead * 7));
  const isToday = daysUntil === 0 && weeksAhead === 0;
  return isToday ? `Today, ${months[d.getMonth()]} ${d.getDate()}` : `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

// Helper: get today's day number (0=Sun, 1=Mon, ... 6=Sat)
function todayNum() { return new Date().getDay(); }

// Curated SABOR events - diverse food scene
const SABOR_EVENTS = [
  // ── BRUNCH ──
  {
    id: 'evt_001',
    title: 'Reggaeton Brunch',
    description: 'Bottomless mimosas, live DJ, and authentic Latin brunch bites. The Sunday vibes you need.',
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
    tags: ['music', 'brunch', 'social'],
    source: 'SABOR'
  },
  {
    id: 'evt_013',
    title: 'Dim Sum Social',
    description: 'All-you-can-eat dim sum with rotating carts, jasmine tea flights, and lion dance performance.',
    venue: 'MingHin Cuisine',
    neighborhood: 'Chinatown',
    city: 'Chicago, IL',
    date: getUpcomingDay(0),
    time: '10:30 AM - 2:00 PM',
    price: '$28',
    priceNum: 28,
    category: 'brunch',
    vibe: 'Social · Cultural',
    emoji: '🥟',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['dim sum', 'brunch', 'chinese', 'social'],
    source: 'SABOR'
  },
  // ── HAPPY HOURS ──
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
    id: 'evt_014',
    title: 'Wine Down Wednesday',
    description: 'Half-off wine bottles, charcuterie boards, and live jazz in a candlelit wine bar. Perfect midweek date night.',
    venue: 'Eno Wine Bar',
    neighborhood: 'Gold Coast',
    city: 'Chicago, IL',
    date: getUpcomingDay(3),
    time: '5:00 PM - 9:00 PM',
    price: '$15 - $30',
    priceNum: 15,
    category: 'happyhour',
    vibe: 'Date Night · Chill',
    emoji: '🍷',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['wine', 'happy hour', 'date night', 'jazz'],
    source: 'SABOR'
  },
  {
    id: 'evt_015',
    title: 'Sake & Sushi Happy Hour',
    description: '$6 specialty rolls, $4 sake flights, and half-off appetizers. The best happy hour on Randolph.',
    venue: 'Momotaro',
    neighborhood: 'West Loop',
    city: 'Chicago, IL',
    date: getUpcomingDay(4),
    time: '4:30 PM - 6:30 PM',
    price: '$6+',
    priceNum: 6,
    category: 'happyhour',
    vibe: 'After Work · Social',
    emoji: '🍣',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['sushi', 'sake', 'happy hour', 'japanese'],
    source: 'SABOR'
  },
  {
    id: 'evt_016',
    title: 'Craft Beer & BBQ Thursday',
    description: 'Local breweries meet pitmasters. $5 pints, smoked brisket sliders, and live blues on the patio.',
    venue: 'Moody Tongue Brewery',
    neighborhood: 'Pilsen',
    city: 'Chicago, IL',
    date: getUpcomingDay(4),
    time: '5:00 PM - 9:00 PM',
    price: '$5+',
    priceNum: 5,
    category: 'happyhour',
    vibe: 'Casual · Social',
    emoji: '🍺',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['beer', 'bbq', 'happy hour', 'blues'],
    source: 'SABOR'
  },
  {
    id: 'evt_017',
    title: 'Rooftop Cocktails & Ceviche',
    description: 'Signature cocktails, fresh ceviche bar, and skyline views. $8 cocktails until 7pm.',
    venue: 'Cerise Rooftop',
    neighborhood: 'River North',
    city: 'Chicago, IL',
    date: getUpcomingDay(5),
    time: '5:00 PM - 10:00 PM',
    price: '$8+',
    priceNum: 8,
    category: 'happyhour',
    vibe: 'Trendy · Views',
    emoji: '🍹',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['cocktails', 'ceviche', 'rooftop', 'happy hour'],
    source: 'SABOR'
  },
  // ── MORNING / COFFEE ──
  {
    id: 'evt_005',
    title: 'Café de Olla Morning',
    description: 'Traditional café de olla, pan dulce, and live acoustic guitar in a cozy café. Slow mornings done right.',
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
    id: 'evt_018',
    title: 'Matcha & Mochi Pop-Up',
    description: 'Artisan matcha drinks, fresh mochi donuts, and Japanese pastries. Limited batches — come early.',
    venue: 'Vanille Patisserie',
    neighborhood: 'Lincoln Park',
    city: 'Chicago, IL',
    date: getUpcomingDay(2),
    time: '9:00 AM - 1:00 PM',
    price: '$10+',
    priceNum: 10,
    category: 'morning',
    vibe: 'Trendy · Sweet',
    emoji: '🍵',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['matcha', 'mochi', 'japanese', 'morning', 'pastry'],
    source: 'SABOR'
  },
  // ── DINNER / EXPERIENCES ──
  {
    id: 'evt_002',
    title: 'Taco & Mezcal Pairing Night',
    description: 'Exclusive tasting — 5 artisanal tacos paired with rare Oaxacan mezcals. Limited to 40 guests.',
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
    id: 'evt_004',
    title: 'Hidden Gem Supper Club',
    description: 'SABOR Premium exclusive — dinner at a secret location revealed 24hrs before. Chef-driven 5-course fusion.',
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
    id: 'evt_019',
    title: 'Ethiopian Feast Night',
    description: 'Communal injera platters, honey wine, and traditional coffee ceremony. Eat with your hands — the way it was meant to be.',
    venue: 'Demera Ethiopian',
    neighborhood: 'Uptown',
    city: 'Chicago, IL',
    date: getUpcomingDay(2),
    time: '6:30 PM - 10:00 PM',
    price: '$30',
    priceNum: 30,
    category: 'dinner',
    vibe: 'Cultural · Social',
    emoji: '🫓',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['ethiopian', 'communal', 'cultural', 'dinner'],
    source: 'SABOR'
  },
  {
    id: 'evt_020',
    title: 'Thai Street Food Night Market',
    description: 'Pad thai, mango sticky rice, and 15+ Thai street food vendors take over a Chinatown parking lot.',
    venue: 'Chinatown Square',
    neighborhood: 'Chinatown',
    city: 'Chicago, IL',
    date: getUpcomingDay(6),
    time: '5:00 PM - 10:00 PM',
    price: 'Free entry',
    priceNum: 0,
    category: 'festival',
    vibe: 'Street Food · Night Market',
    emoji: '🍜',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['thai', 'night market', 'street food', 'free'],
    source: 'SABOR'
  },
  {
    id: 'evt_010',
    title: 'Chef Table: Global Fusion',
    description: 'Intimate 10-person chef table. 8-course tasting menu blending Latin, Asian, and Mediterranean flavors.',
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
    id: 'evt_021',
    title: 'Korean BBQ & Karaoke Night',
    description: 'All-you-can-eat Korean BBQ, soju bombs, and private karaoke rooms. Group discount for 4+.',
    venue: 'San Soo Gab San',
    neighborhood: 'Lincoln Square',
    city: 'Chicago, IL',
    date: getUpcomingDay(3),
    time: '7:00 PM - 12:00 AM',
    price: '$35',
    priceNum: 35,
    category: 'dinner',
    vibe: 'Social · Fun',
    emoji: '🥩',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['korean', 'bbq', 'karaoke', 'social', 'group'],
    source: 'SABOR'
  },
  // ── FESTIVALS / MARKETS ──
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
    id: 'evt_008',
    title: 'Vegan Food Market',
    description: 'Plant-based food vendors, cooking demos, and live music. Tacos, Thai, Soul Food — all vegan.',
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
    id: 'evt_022',
    title: 'Pizza & Gelato Block Party',
    description: 'Chicago deep dish vs Detroit-style showdown. Live voting, gelato truck, and patio DJ.',
    venue: 'Parlor Pizza Bar',
    neighborhood: 'West Loop',
    city: 'Chicago, IL',
    date: getUpcomingDay(2),
    time: '1:00 PM - 6:00 PM',
    price: 'Free entry',
    priceNum: 0,
    category: 'festival',
    vibe: 'Fun · Family',
    emoji: '🍕',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['pizza', 'gelato', 'italian', 'free', 'family'],
    source: 'SABOR'
  },
  {
    id: 'evt_023',
    title: 'Global Street Food Fest',
    description: 'Vendors from 12 countries — jerk chicken, empanadas, gyros, banh mi, jollof rice. Live world music stage.',
    venue: 'Grant Park',
    neighborhood: 'Loop',
    city: 'Chicago, IL',
    date: getUpcomingDay(6, 1),
    time: '11:00 AM - 9:00 PM',
    price: 'Free entry',
    priceNum: 0,
    category: 'festival',
    vibe: 'Festival · Global',
    emoji: '🌍',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['global', 'festival', 'free', 'street food', 'family'],
    source: 'SABOR'
  },
  // ── SOCIAL / NIGHTLIFE ──
  {
    id: 'evt_011',
    title: 'Salsa Night & Tapas',
    description: 'Learn salsa from a pro, then eat. Live band, tapas from 5 countries, open bar.',
    venue: 'Casa Salsa Chicago',
    neighborhood: 'Wicker Park',
    city: 'Chicago, IL',
    date: getUpcomingDay(5),
    time: '8:00 PM - 1:00 AM',
    price: '$40',
    priceNum: 40,
    category: 'social',
    vibe: 'Dance · Social',
    emoji: '💃',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['salsa', 'dancing', 'tapas', 'social'],
    source: 'SABOR'
  },
  {
    id: 'evt_007',
    title: 'Birria & Beats',
    description: 'The best birria in Chicago paired with live DJ sets. Bottomless consommé. Cash bar.',
    venue: 'La Villita Cultural Center',
    neighborhood: 'Little Village',
    city: 'Chicago, IL',
    date: getUpcomingDay(1),
    time: '6:00 PM - 11:00 PM',
    price: '$25',
    priceNum: 25,
    category: 'social',
    vibe: 'Music · Food',
    emoji: '🎶',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['birria', 'music', 'social'],
    source: 'SABOR'
  },
  // ── AFTERNOON / SNACK ──
  {
    id: 'evt_012',
    title: 'Elote & Antojitos Pop-Up',
    description: 'Street food pop-up featuring Chicago\'s best elote vendors, tamale ladies, and paleteros.',
    venue: 'Pilsen Community Garden',
    neighborhood: 'Pilsen',
    city: 'Chicago, IL',
    date: getUpcomingDay(1),
    time: '2:00 PM - 7:00 PM',
    price: 'Free entry',
    priceNum: 0,
    category: 'snack',
    vibe: 'Street Food · Family',
    emoji: '🌽',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['elote', 'street food', 'free', 'family', 'antojitos'],
    source: 'SABOR'
  },
  {
    id: 'evt_024',
    title: 'Cafetón — Coffee & Culture',
    description: 'An afternoon coffee party with pastries, live poetry, and specialty lattes from local roasters.',
    venue: 'Osmium Coffee Bar',
    neighborhood: 'Pilsen',
    city: 'Chicago, IL',
    date: getUpcomingDay(1),
    time: '2:00 PM - 5:00 PM',
    price: '$12',
    priceNum: 12,
    category: 'snack',
    vibe: 'Chill · Creative',
    emoji: '☕',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['coffee', 'afternoon', 'culture', 'chill'],
    source: 'SABOR'
  },
  {
    id: 'evt_025',
    title: 'Boba & Board Games',
    description: 'Bubble tea flights, Asian snacks, and 200+ board games. Perfect for a chill afternoon with friends.',
    venue: 'Bonus Round Game Café',
    neighborhood: 'Logan Square',
    city: 'Chicago, IL',
    date: getUpcomingDay(2),
    time: '1:00 PM - 6:00 PM',
    price: '$10',
    priceNum: 10,
    category: 'snack',
    vibe: 'Chill · Social',
    emoji: '🧋',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['boba', 'games', 'afternoon', 'social', 'asian'],
    source: 'SABOR'
  },
  // ── WELLNESS / SPECIAL ──
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
    id: 'evt_026',
    title: 'Mediterranean Meze & Wine',
    description: 'Shared meze platters, natural wines, and sunset views. Hummus, falafel, grilled halloumi, and more.',
    venue: 'Aba',
    neighborhood: 'Fulton Market',
    city: 'Chicago, IL',
    date: getUpcomingDay(4),
    time: '6:00 PM - 9:00 PM',
    price: '$25',
    priceNum: 25,
    category: 'dinner',
    vibe: 'Date Night · Chill',
    emoji: '🫒',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['mediterranean', 'wine', 'date night', 'dinner'],
    source: 'SABOR'
  },
  {
    id: 'evt_027',
    title: 'Southern Brunch & Gospel',
    description: 'Chicken & waffles, shrimp & grits, and a live gospel choir. Chicago soul food at its finest.',
    venue: 'Pearl\'s Place',
    neighborhood: 'Bronzeville',
    city: 'Chicago, IL',
    date: getUpcomingDay(0),
    time: '10:00 AM - 2:00 PM',
    price: '$22',
    priceNum: 22,
    category: 'brunch',
    vibe: 'Cultural · Soul Food',
    emoji: '🧇',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['brunch', 'soul food', 'gospel', 'southern'],
    source: 'SABOR'
  },
];

// ═══════════════════════════════════════
// INDIANAPOLIS CURATED EVENTS
// ═══════════════════════════════════════
const INDY_EVENTS = [
  {
    id: 'evt_indy_001',
    title: 'Taco Tuesday Crawl — Mass Ave',
    description: '$2 street tacos at 4 stops along Mass Ave. Margarita specials at every stop. SABOR guides the route.',
    venue: 'Multiple Locations',
    neighborhood: 'Mass Ave → Fountain Square',
    city: 'Indianapolis, IN',
    date: getUpcomingDay(2),
    time: '5:00 PM - 9:00 PM',
    price: '$15 suggested',
    priceNum: 15,
    category: 'happyhour',
    vibe: 'Fun · Social',
    emoji: '🌮',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['tacos', 'crawl', 'happy hour', 'social'],
    source: 'SABOR'
  },
  {
    id: 'evt_indy_002',
    title: 'BBQ & Blues on the Canal',
    description: 'Smoked brisket, pulled pork, and live blues along the Indianapolis Canal Walk. Craft beer from local breweries.',
    venue: 'Canal Walk',
    neighborhood: 'Downtown',
    city: 'Indianapolis, IN',
    date: getUpcomingDay(6),
    time: '12:00 PM - 7:00 PM',
    price: 'Free entry',
    priceNum: 0,
    category: 'festival',
    vibe: 'Family · Community',
    emoji: '🍗',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['bbq', 'blues', 'festival', 'free', 'family'],
    source: 'SABOR'
  },
  {
    id: 'evt_indy_003',
    title: 'Fountain Square Food Walk',
    description: 'Guided food tour through Fountain Square — 5 stops, 5 cuisines. Ethiopian, Mexican, Vietnamese, Southern, and Korean.',
    venue: 'Fountain Square',
    neighborhood: 'Fountain Square',
    city: 'Indianapolis, IN',
    date: getUpcomingDay(6),
    time: '11:00 AM - 3:00 PM',
    price: '$40',
    priceNum: 40,
    category: 'festival',
    vibe: 'Cultural · Diverse',
    emoji: '🌍',
    image: null,
    premiumOnly: false,
    earlyAccess: true,
    tags: ['food tour', 'diverse', 'cultural'],
    source: 'SABOR'
  },
  {
    id: 'evt_indy_004',
    title: 'Mercado Night — Lafayette Square',
    description: 'Open-air night market with 15+ Latin food vendors, live mariachi, and artisan goods. The heart of Indy\'s Latino scene.',
    venue: 'Lafayette Square Mall Area',
    neighborhood: 'Lafayette Square',
    city: 'Indianapolis, IN',
    date: getUpcomingDay(5),
    time: '6:00 PM - 11:00 PM',
    price: 'Free entry',
    priceNum: 0,
    category: 'festival',
    vibe: 'Street Food · Cultural',
    emoji: '🔥',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['mercado', 'latin', 'night market', 'free', 'street food'],
    source: 'SABOR'
  },
  {
    id: 'evt_indy_005',
    title: 'Brunch & Mimosas — Broad Ripple',
    description: 'Bottomless mimosas, avocado toast flights, and live acoustic at three Broad Ripple brunch spots.',
    venue: 'Multiple Locations',
    neighborhood: 'Broad Ripple',
    city: 'Indianapolis, IN',
    date: getUpcomingDay(0),
    time: '10:00 AM - 2:00 PM',
    price: '$30',
    priceNum: 30,
    category: 'brunch',
    vibe: 'Social · Chill',
    emoji: '🥂',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['brunch', 'mimosas', 'social'],
    source: 'SABOR'
  },
];

// ═══════════════════════════════════════
// ROCKFORD / SPRINGFIELD / OTHER IL CURATED EVENTS
// ═══════════════════════════════════════
const IL_REGIONAL_EVENTS = [
  {
    id: 'evt_il_001',
    title: 'Route 66 BBQ Fest',
    description: 'Springfield\'s best pitmasters compete. Smoked ribs, brisket, and cornbread. Live country music and cold beer.',
    venue: 'Route 66 Event Center',
    neighborhood: 'Downtown',
    city: 'Springfield, IL',
    date: getUpcomingDay(6),
    time: '11:00 AM - 8:00 PM',
    price: 'Free entry',
    priceNum: 0,
    category: 'festival',
    vibe: 'Family · Community',
    emoji: '🍖',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['bbq', 'festival', 'route 66', 'free', 'family'],
    source: 'SABOR'
  },
  {
    id: 'evt_il_002',
    title: 'Taco & Cerveza Night — Rockford',
    description: 'Rockford\'s best taquerías set up shop on Broadway. $3 tacos, $4 cervezas, and a live DJ.',
    venue: 'Broadway District',
    neighborhood: 'Broadway',
    city: 'Rockford, IL',
    date: getUpcomingDay(5),
    time: '5:00 PM - 10:00 PM',
    price: '$3+',
    priceNum: 3,
    category: 'happyhour',
    vibe: 'Fun · Social',
    emoji: '🌮',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['tacos', 'beer', 'happy hour', 'social'],
    source: 'SABOR'
  },
  {
    id: 'evt_il_003',
    title: 'Campus Eats Crawl — Champaign',
    description: 'SABOR-guided food crawl through Campustown. Korean fried chicken, ramen, Thai, and boba. Student pricing.',
    venue: 'Campustown',
    neighborhood: 'Campustown',
    city: 'Champaign, IL',
    date: getUpcomingDay(4),
    time: '5:00 PM - 9:00 PM',
    price: '$20',
    priceNum: 20,
    category: 'happyhour',
    vibe: 'Student · Social',
    emoji: '🍜',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['food crawl', 'student', 'asian', 'social'],
    source: 'SABOR'
  },
];

// ═══════════════════════════════════════
// FORT WAYNE / SOUTH BEND / OTHER IN CURATED EVENTS
// ═══════════════════════════════════════
const IN_REGIONAL_EVENTS = [
  {
    id: 'evt_in_001',
    title: 'South Side Food Tour — Fort Wayne',
    description: 'Burmese, Mexican, and soul food within 6 blocks. Fort Wayne\'s most diverse food corridor.',
    venue: 'South Side',
    neighborhood: 'South Side',
    city: 'Fort Wayne, IN',
    date: getUpcomingDay(6),
    time: '11:00 AM - 3:00 PM',
    price: '$25',
    priceNum: 25,
    category: 'festival',
    vibe: 'Cultural · Diverse',
    emoji: '🌍',
    image: null,
    premiumOnly: false,
    earlyAccess: true,
    tags: ['food tour', 'diverse', 'cultural'],
    source: 'SABOR'
  },
  {
    id: 'evt_in_002',
    title: 'Eddy Street Eats — South Bend',
    description: 'South Bend\'s best food street comes alive. Asian, Mexican, and American — all walkable from Notre Dame.',
    venue: 'Eddy Street Commons',
    neighborhood: 'Eddy Street',
    city: 'South Bend, IN',
    date: getUpcomingDay(5),
    time: '5:00 PM - 9:00 PM',
    price: 'Free entry',
    priceNum: 0,
    category: 'happyhour',
    vibe: 'Student · Social',
    emoji: '☘️',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['food crawl', 'student', 'happy hour', 'social'],
    source: 'SABOR'
  },
  {
    id: 'evt_in_003',
    title: 'NWI Taco Fest — Gary/Hammond',
    description: 'Northwest Indiana\'s taquería owners gather for a taco showdown. 10+ vendors, live cumbia, kids free.',
    venue: 'Marquette Park',
    neighborhood: 'Miller Beach',
    city: 'Gary, IN',
    date: getUpcomingDay(6),
    time: '12:00 PM - 7:00 PM',
    price: 'Free entry',
    priceNum: 0,
    category: 'festival',
    vibe: 'Family · Community',
    emoji: '🌮',
    image: null,
    premiumOnly: false,
    earlyAccess: false,
    tags: ['tacos', 'festival', 'free', 'family', 'nwi'],
    source: 'SABOR'
  },
];

// Merge all curated events
const ALL_SABOR_EVENTS = [...SABOR_EVENTS, ...INDY_EVENTS, ...IL_REGIONAL_EVENTS, ...IN_REGIONAL_EVENTS];

// ── TICKETMASTER API ──
async function fetchTicketmasterEvents(city) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return [];

  try {
    const cityName = city.split(',')[0].trim();
    const today = new Date();
    const startDate = today.toISOString().split('.')[0] + 'Z';
    const endDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('.')[0] + 'Z';

    // Strategy: TM has very few "food" events. Search broader categories that pair with food
    // (concerts, comedy, nightlife — things people do around a meal) plus direct food keywords.
    // Use 3 parallel searches: 1 food-specific, 1 nightlife/entertainment, 1 broad city events
    const fetches = [
      // Food-specific: brunch and food are the most productive keywords
      (async () => {
        try {
          const url = `https://app.ticketmaster.com/discovery/v2/events.json?keyword=food+brunch+dinner+tasting&city=${encodeURIComponent(cityName)}&startDateTime=${startDate}&endDateTime=${endDate}&size=10&sort=date,asc&apikey=${apiKey}`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (!resp.ok) return [];
          const data = await resp.json();
          return data?._embedded?.events || [];
        } catch { return []; }
      })(),
      // Entertainment that pairs with food: comedy, live music, shows
      (async () => {
        try {
          const url = `https://app.ticketmaster.com/discovery/v2/events.json?classificationName=music&city=${encodeURIComponent(cityName)}&startDateTime=${startDate}&endDateTime=${endDate}&size=6&sort=date,asc&apikey=${apiKey}`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (!resp.ok) return [];
          const data = await resp.json();
          return data?._embedded?.events || [];
        } catch { return []; }
      })(),
      // Broad: arts, theatre, festivals
      (async () => {
        try {
          const url = `https://app.ticketmaster.com/discovery/v2/events.json?classificationName=arts&city=${encodeURIComponent(cityName)}&startDateTime=${startDate}&endDateTime=${endDate}&size=6&sort=date,asc&apikey=${apiKey}`;
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
    }).slice(0, 8);

    return tmEvents.map((e, i) => {
      const venue = e._embedded?.venues?.[0] || {};
      const startLocal = e.dates?.start?.localDate || '';
      const startTime = e.dates?.start?.localTime || '';
      const priceMin = e.priceRanges?.[0]?.min;
      const priceMax = e.priceRanges?.[0]?.max;
      const priceStr = priceMin ? (priceMax && priceMax !== priceMin ? `$${priceMin} - $${priceMax}` : `$${priceMin}`) : 'See event';
      const img = e.images?.find(img => img.width >= 300)?.url || null;

      // Format date nicely
      const eventDate = new Date(startLocal + 'T' + (startTime || '00:00:00'));
      const isToday = startLocal === today.toISOString().split('T')[0];
      const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const dateStr = isToday
        ? `Today, ${months[eventDate.getMonth()]} ${eventDate.getDate()}`
        : `${days[eventDate.getDay()]}, ${months[eventDate.getMonth()]} ${eventDate.getDate()}`;

      // Format time
      let timeStr = '';
      if (startTime) {
        const [h, m] = startTime.split(':');
        const hour = parseInt(h);
        timeStr = `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
      }

      return {
        id: `tm_${e.id}`,
        title: e.name,
        description: (e.info || e.pleaseNote || e.name || '').substring(0, 200),
        venue: venue.name || 'TBA',
        neighborhood: venue.city?.name || cityName,
        city: city,
        date: dateStr,
        time: timeStr,
        price: priceStr,
        priceNum: priceMin || 0,
        category: 'live',
        vibe: 'Live Event',
        emoji: '🎟️',
        image: img,
        premiumOnly: false,
        earlyAccess: false,
        tags: ['live', 'ticketmaster'],
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

  // Fetch Ticketmaster events in parallel with curated
  let tmEvents = [];
  try {
    tmEvents = await fetchTicketmasterEvents(city);
  } catch (_) {}

  // Curated SABOR events (all cities)
  let curatedEvents = ALL_SABOR_EVENTS.filter(e =>
    e.city.toLowerCase().includes(city.split(',')[0].toLowerCase())
  );

  // Merge: live events first, then curated (tagged differently)
  let allEvents = [...tmEvents, ...curatedEvents];

  if (category && category !== 'all') {
    if (category === 'live') {
      allEvents = allEvents.filter(e => e.source === 'Ticketmaster');
    } else {
      allEvents = allEvents.filter(e => e.category === category || e.tags.includes(category));
    }
  }

  if (budget) {
    const maxBudget = parseInt(budget);
    if (!isNaN(maxBudget)) {
      allEvents = allEvents.filter(e => e.priceNum <= maxBudget);
    }
  }

  // Sort: today first, then live events, then by date
  const todayStr = 'Today,';
  allEvents.sort((a, b) => {
    const aToday = a.date.startsWith(todayStr) ? 0 : 1;
    const bToday = b.date.startsWith(todayStr) ? 0 : 1;
    if (aToday !== bToday) return aToday - bToday;
    // Live events before curated within same date
    const aLive = a.source === 'Ticketmaster' ? 0 : 1;
    const bLive = b.source === 'Ticketmaster' ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;
    return 0;
  });

  return res.status(200).json({
    events: allEvents,
    total: allEvents.length,
    sources: { ticketmaster: tmEvents.length, curated: curatedEvents.length },
  });
}
