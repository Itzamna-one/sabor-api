import Anthropic from "@anthropic-ai/sdk";
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { checkAppKey, checkRateLimit, verifyTierFromRC, getClientIp } from '../lib/sabor-security.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Lazy Firebase init
function getDb() {
  if (!getApps().length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    initializeApp({ credential: cert(sa) });
  } else {
    getApp();
  }
  return getFirestore();
}

// Owner tier cache — refreshed every 10 minutes to avoid per-search Firestore reads
let _ownerTierCache = null;
let _ownerTierCacheAt = 0;
const OWNER_TIER_TTL = 10 * 60 * 1000; // 10 minutes

async function getOwnerTierMap() {
  const now = Date.now();
  if (_ownerTierCache && now - _ownerTierCacheAt < OWNER_TIER_TTL) return _ownerTierCache;
  try {
    const db = getDb();
    const snap = await db.collection('owner_accounts')
      .where('active', '==', true)
      .get();
    const map = {};
    snap.forEach(doc => {
      const d = doc.data();
      if (!d.restaurantName) return;
      // badgeType takes precedence over tier for display
      const displayTier = d.badgeType || d.tier || null;
      if (!displayTier || displayTier === 'free') return;
      const key = d.restaurantName.toLowerCase().replace(/[^a-z0-9]/g, '');
      map[key] = displayTier; // 'pick' | 'pro' | 'elite'
    });
    _ownerTierCache = map;
    _ownerTierCacheAt = now;
    return map;
  } catch (e) {
    console.error('Owner tier cache load failed:', e.message);
    return _ownerTierCache || {};
  }
}

async function injectOwnerTiers(results) {
  if (!results || results.length === 0) return results;
  try {
    const tierMap = await getOwnerTierMap();
    if (Object.keys(tierMap).length === 0) return results;
    return results.map(r => {
      const cleanName = (r.name || '').split(' — ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      const tier = tierMap[cleanName];
      return tier ? { ...r, ownerTier: tier } : r;
    });
  } catch (_) {
    return results; // never fail a search because of badge lookup
  }
}

// Fire-and-forget search log — never blocks the response
function logSearch(query, city, tier, language, neighborhood) {
  try {
    const db = getDb();
    const cityKey = (city || 'Chicago').split(',')[0].trim().toLowerCase();
    db.collection('search_logs').add({
      query: query.slice(0, 200),
      city: cityKey,
      tier: tier || 'free',
      language: language || 'es',
      neighborhood: neighborhood || null,
      timestamp: FieldValue.serverTimestamp(),
    }).catch(() => {}); // silently ignore write errors
  } catch (_) {
    // never throw — search must not fail because of logging
  }
}

// Neighborhood intelligence — Illinois + Indiana
const NEIGHBORHOOD_VIBES = {
  // ── Chicago ──
  "Pilsen":           "murals, Mexican classics, art scene, family taquerías, trendy cafes",
  "Little Village":   "authentic Mexican, carnitas, La Villita markets, antojitos",
  "Humboldt Park":    "Puerto Rican cuisine, jibarito, pasteles, diverse eats",
  "Logan Square":     "trendy fusion, craft cocktails, viral brunch, upscale dining, Thai, ramen",
  "Wicker Park":      "instagrammable spots, diverse brunch, eclectic global cuisine, pizza",
  "Back of the Yards":"old school Mexican, no tourists, local prices, BBQ, soul food",
  "Avondale":         "hidden gems, Polish-Mexican mix, Korean, diverse neighborhood eats",
  "Bridgeport":       "local gems, Chinese, Italian, under the radar favorites",
  "Bronzeville":      "soul food, Afro-Caribbean, rich history, bold flavors, comfort food",
  "South Chicago":    "traditional Mexican, fresh seafood, family-style dining",
  "West Town":        "emerging restaurants, young chefs, trending spots, creative global cuisine",
  "Andersonville":    "international fusion, Swedish roots, modern cuisine, Middle Eastern, Ethiopian",
  "Chinatown":        "dim sum, Sichuan, Cantonese, BBQ, hot pot, bubble tea",
  "Lincoln Park":     "upscale dining, Italian, sushi, French bistros, brunch",
  "River North":      "steakhouses, sushi, rooftop bars, upscale global dining",
  "Uptown":           "Vietnamese pho, Ethiopian, diverse immigrant cuisines, affordable eats",
  "Devon Ave":        "Indian, Pakistani, Bangladeshi, South Asian street food, biryani",
  "Albany Park":      "Korean BBQ, Middle Eastern, Guatemalan, one of Chicago's most diverse food scenes",
  "Rogers Park":      "Jamaican, Mexican, Ethiopian, diverse student-area eats",
  "Hyde Park":        "soul food, Japanese, campus eats, independent diners, diverse cafes",
  "West Loop":        "Randolph Row, steakhouses, Greek Town, fine dining, chef-driven spots",
  "Lakeview":         "Thai, ramen, sports bars, diverse casual dining, brunch",
  "East Garfield Park":"emerging eats, soul food, community spots, Madison Street corridor",
  "West Garfield Park":"BBQ, comfort food, hidden neighborhood gems, Madison Street",
  "Chicago Lawn":     "63rd Street Mexican, Middle Eastern, diverse strip malls",
  "Englewood":        "soul food, BBQ, fish spots, local comfort food, 63rd Street",
  "Auburn Gresham":   "79th Street eats, soul food, fish, hidden comfort spots",
  "Roseland":         "BBQ, fish, soul food, Michigan Avenue corridor",
  "Pullman":          "historic district, emerging restaurants, community dining",
  "Clearing":         "Midway area, Mexican, Polish, local casual eats",
  "Garfield Ridge":   "Midway corridor, casual dining, family spots",
  "Irving Park":      "Mexican, Korean, local neighborhood eats, diverse",
  "Portage Park":     "Polish, Italian, Six Corners, family restaurants",
  "River North":      "nightlife, steakhouses, sushi, upscale global dining",
  // ── Chicago suburbs ──
  "Oak Lawn":         "95th Street diverse corridor, Arabic, Mexican, family dining",
  "Evergreen Park":   "local family dining, casual eats, 95th Street",
  "Cicero":           "Little Mexico of the suburbs, Cermak Road taquerías, authentic antojitos",
  "Berwyn":           "Mexican-Czech mix, Cermak Road eats, Depot District bars",
  "Evanston":         "upscale brunch, diverse college-town dining, Middle Eastern",
  "Schaumburg":       "Indian, Korean, global mall dining, Golf Road corridor",
  // ── Illinois metro ──
  "Aurora":           "second-largest IL city, Latin main street, diverse east side",
  "Joliet":           "historic downtown, Mexican east side, diverse corridors",
  "Naperville":       "upscale dining, South Asian corridor, brunch scene",
  "Elgin":            "Latino heart of the Fox Valley, downtown taquerías, McLean Blvd corridor",
  "Waukegan":         "Mexican, Salvadoran, Latin corridor on Belvidere Rd",
  "Rockford":         "revitalized downtown, Broadway Latino eats, East State diversity",
  "Springfield":      "Route 66 classics, South Grand Asian strip, soul food",
  "Champaign":        "university town, Campustown Asian eats, diverse Green Street",
  // ── Indiana — NW Indiana (Chicagoland) ──
  "Gary":             "soul food, BBQ, lakefront casual, Broadway Mexican",
  "East Chicago":     "Indiana Harbor Mexican, authentic Latin corridor",
  "Hammond":          "Mexican, Salvadoran, Calumet Ave diversity, Hessville BBQ",
  "Valparaiso":       "charming downtown, local bistros, Route 30 diversity",
  // ── Indiana — major metros ──
  "Indianapolis":     "West Washington Latino heart, Fountain Square trendy, Mass Ave upscale, 38th St global",
  "Fort Wayne":       "revitalized downtown, South Side Mexican-Burmese, Lima Road diversity",
  "South Bend":       "west side Mexican, Eddy Street student eats, revitalized downtown",
};

// Tier radius config
const TIER_CONFIG = {
  free:    { radius: "1mi",     label: 'cerca de ti' },
  credits: { radius: "3mi",     label: "tu zona" },
  premium: { radius: "citywide",label: "toda la ciudad" },
};

// Simple in-memory cache
const searchCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCacheKey(query, city, tier, language, filterNeighborhood, currentNeighborhood, diets) {
  const normalized = query.toLowerCase()
    .replace(/\b(the|a|an|best|top|find|near|me|in|at)\b/g, '')
    .replace(/\s+/g, ' ').trim();
  const hood = filterNeighborhood ? filterNeighborhood.toLowerCase() : 'all';
  const userHood = currentNeighborhood ? currentNeighborhood.toLowerCase() : 'none';
  const dietKey = (diets || []).sort().join(',') || 'none';
  return `${normalized}|${city.split(',')[0].toLowerCase()}|${tier}|${language}|${hood}|${userHood}|${dietKey}`;
}

function getCached(key) {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) { searchCache.delete(key); return null; }
  return entry.data;
}

function setCache(key, data) {
  if (searchCache.size >= 500) searchCache.delete(searchCache.keys().next().value);
  searchCache.set(key, { data, timestamp: Date.now() });
}


// ── Google Places name-based neighborhood verification ──
// The AI hallucinates addresses. Geocoding a fake address gives a fake neighborhood.
// Instead: look up the restaurant NAME in Google Places → get the REAL address + neighborhood.
// Same approach as places-enrich.js but focused on neighborhood correction.
const placeCache = new Map();
const PLACE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Geo-bias centers for Google Places lookups (matches home-feed.js + places-enrich.js)
const CITY_GEO = {
  'chicago':        { lat: 41.8781, lng: -87.6298 },
  'aurora':         { lat: 41.7606, lng: -88.3201 },
  'joliet':         { lat: 41.5250, lng: -88.0817 },
  'naperville':     { lat: 41.7508, lng: -88.1535 },
  'elgin':          { lat: 42.0354, lng: -88.2826 },
  'waukegan':       { lat: 42.3636, lng: -87.8448 },
  'cicero':         { lat: 41.8456, lng: -87.7539 },
  'berwyn':         { lat: 41.8506, lng: -87.7937 },
  'rockford':       { lat: 42.2711, lng: -89.0940 },
  'springfield':    { lat: 39.7817, lng: -89.6501 },
  'champaign':      { lat: 40.1164, lng: -88.2434 },
  'evanston':       { lat: 42.0451, lng: -87.6877 },
  'schaumburg':     { lat: 42.0334, lng: -88.0834 },
  'peoria':         { lat: 40.6936, lng: -89.5890 },
  'bloomington':    { lat: 40.4842, lng: -88.9937 },
  'decatur':        { lat: 39.8403, lng: -88.9548 },
  'dekalb':         { lat: 41.9295, lng: -88.7503 },
  'gary':           { lat: 41.5934, lng: -87.3464 },
  'east chicago':   { lat: 41.6392, lng: -87.4545 },
  'hammond':        { lat: 41.5834, lng: -87.5001 },
  'indianapolis':   { lat: 39.7684, lng: -86.1581 },
  'fort wayne':     { lat: 41.0793, lng: -85.1394 },
  'south bend':     { lat: 41.6764, lng: -86.2520 },
  'valparaiso':     { lat: 41.4731, lng: -87.0611 },
  'evansville':     { lat: 37.9716, lng: -87.5711 },
  'terre haute':    { lat: 39.4667, lng: -87.4139 },
  'lafayette':      { lat: 40.4167, lng: -86.8753 },
  'muncie':         { lat: 40.1934, lng: -85.3864 },
  'michigan city':  { lat: 41.7075, lng: -86.8950 },
};

function getSearchGeo(city) {
  const key = city.toLowerCase().split(',')[0].trim();
  return CITY_GEO[key] || CITY_GEO['chicago'];
}

// ── Chicago address-to-neighborhood resolver ──
// When Google Places doesn't return a neighborhood component (common for Chicago),
// we resolve it ourselves using ZIP code + street name/number patterns.
// This is the authoritative source — Chicago neighborhoods have well-known street boundaries.
function resolveChicagoNeighborhood(address) {
  if (!address) return null;
  const addr = address.toLowerCase();

  // Extract ZIP code
  const zipMatch = addr.match(/\b(6\d{4}|460\d{2}|462\d{2}|463\d{2}|464\d{2}|473\d{2})\b/);
  const zip = zipMatch ? zipMatch[1] : null;

  // Extract street number (first number in address)
  const numMatch = addr.match(/^(\d+)\s/);
  const streetNum = numMatch ? parseInt(numMatch[1]) : null;

  // Extract street name
  const streetLower = addr.toLowerCase();

  // ── Pre-ZIP cross-validation for long N-S streets ──
  // The AI hallucinate wrong ZIPs on major streets. Street numbers are authoritative:
  // Chicago grid: 800 addresses = 1 mile. Madison St = 0. South addresses are positive.
  // 2600 S ≈ 26th St, 3900 S ≈ 39th St, 4800 S ≈ 48th St, 5500 S ≈ 55th St, 6600 S ≈ 66th St
  if (streetNum && /\bpulaski\b/.test(streetLower)) {
    if (streetNum >= 6300) return 'Chicago Lawn';
    if (streetNum >= 5500 && streetNum < 6300) return 'West Lawn';
    if (streetNum >= 4300 && streetNum < 5500) return 'Archer Heights';
    if (streetNum >= 3500 && streetNum < 4300) return 'Brighton Park';
    if (streetNum >= 2200 && streetNum < 3500) return 'Little Village';
    if (streetNum >= 800 && streetNum < 2200) return 'North Lawndale';
    if (streetNum < 800) return 'Humboldt Park'; // only NORTH Pulaski is Humboldt Park
  }
  if (streetNum && /\bwestern\b/.test(streetLower)) {
    if (streetNum >= 6300) return 'Marquette Park';
    if (streetNum >= 4700 && streetNum < 6300) return 'Gage Park';
    if (streetNum >= 3100 && streetNum < 4700) return 'Brighton Park';
    if (streetNum >= 2200 && streetNum < 3100) return 'Little Village';
  }
  if (streetNum && /\bkedzie\b/.test(streetLower)) {
    if (streetNum >= 4700) return 'Gage Park';
    if (streetNum >= 3500 && streetNum < 4700) return 'Brighton Park';
    if (streetNum >= 2200 && streetNum < 3500) return 'Little Village';
    if (streetNum >= 800 && streetNum < 2200) return 'North Lawndale';
    if (streetNum < 800) return 'Humboldt Park';
  }

  // ── Chicago ZIP-based resolution with street disambiguation ──

  // 60608 — Pilsen / Chinatown / Bridgeport (needs street disambiguation)
  if (zip === '60608') {
    if (/\bwentworth\b/.test(streetLower)) return 'Chinatown';
    if (/\barcher\b/.test(streetLower) && streetNum && streetNum < 2400) return 'Chinatown';
    if (/\bcermak\b|\b22nd\b/.test(streetLower)) {
      // Cermak near Wentworth = Chinatown, Cermak west of Halsted = Pilsen
      if (streetNum && streetNum < 400) return 'Chinatown'; // near Wentworth (east)
      return 'Pilsen';
    }
    if (/\b18th\b|\b19th\b|\b20th\b|\b21st\b/.test(streetLower)) return 'Pilsen';
    if (/\b16th\b|\b17th\b/.test(streetLower)) return 'Pilsen';
    if (/\bhalsted\b/.test(streetLower)) {
      if (streetNum && streetNum >= 3000) return 'Bridgeport';
      return 'Pilsen';
    }
    if (/\b31st\b|\b32nd\b|\b33rd\b|\b34th\b|\b35th\b/.test(streetLower)) return 'Bridgeport';
    if (/\bmorgan\b|\brack\b|\bthroop\b|\bloomis\b/.test(streetLower)) return 'Pilsen';
    return 'Pilsen'; // default for 60608
  }

  // 60616 — Chinatown / Bridgeport / Bronzeville
  if (zip === '60616') {
    if (/\bwentworth\b|\barcher\b/.test(streetLower)) return 'Chinatown';
    if (/\bking\b|\bcottage\b|\bstate\b/.test(streetLower)) return 'Bronzeville';
    if (/\bhalsted\b|\bmorgan\b/.test(streetLower)) return 'Bridgeport';
    return 'Chinatown';
  }

  // 60623 — Little Village / Lawndale
  if (zip === '60623') {
    if (/\b26th\b/.test(streetLower)) return 'Little Village';
    return 'Little Village';
  }

  // 60622 — Wicker Park / Ukrainian Village / West Town
  if (zip === '60622') {
    if (/\bmilwaukee\b/.test(streetLower)) return 'Wicker Park';
    if (/\bnorth\s+ave\b|\bdamen\b/.test(streetLower)) return 'Wicker Park';
    if (/\bdivision\b/.test(streetLower)) return 'Ukrainian Village';
    if (/\bchicago\s+ave\b|\baugusta\b|\berie\b|\bhuron\b|\bsuperior\b/.test(streetLower)) return 'West Town';
    if (/\bwestern\b/.test(streetLower)) return 'Ukrainian Village';
    return 'Wicker Park';
  }

  // 60647 — Logan Square / Bucktown
  if (zip === '60647') {
    if (/\bmilwaukee\b|\bkedzie\b|\bfullerton\b/.test(streetLower) && streetNum && streetNum >= 2400) return 'Logan Square';
    if (/\bnorth\s+ave\b|\bdamen\b/.test(streetLower)) return 'Bucktown';
    return 'Logan Square';
  }

  // 60607 — West Loop / Greektown
  if (zip === '60607') {
    if (/\brandolph\b|\bfulton\b|\bmadison\b|\bwashington\b/.test(streetLower)) return 'West Loop';
    if (/\bhalsted\b|\bvan\s*buren\b/.test(streetLower)) return 'Greektown';
    return 'West Loop';
  }

  // 60654 — River North
  if (zip === '60654') return 'River North';

  // 60610 — Gold Coast / Old Town
  if (zip === '60610') {
    if (/\brush\b|\bstate\b|\bgold\b/.test(streetLower)) return 'Gold Coast';
    if (/\bwells\b|\bnorth\b|\bsedgwick\b/.test(streetLower)) return 'Old Town';
    return 'Gold Coast';
  }

  // 60614 — Lincoln Park
  if (zip === '60614') return 'Lincoln Park';

  // 60657 — Lakeview / Boystown
  if (zip === '60657') {
    // Boystown: Halsted between Belmont and Addison (roughly 3200-3700 N)
    if (/\bhalsted\b|\bbroadway\b/.test(streetLower)) return 'Boystown';
    return 'Lakeview';
  }

  // 60613 — Wrigleyville / North Lakeview
  if (zip === '60613') return 'Lakeview';

  // 60640 — Uptown / Andersonville
  if (zip === '60640') {
    if (/\bclark\b/.test(streetLower) && /\bfoster\b|\bbalmoral\b|\bberwyn\b/.test(streetLower)) return 'Andersonville';
    if (/\bbroadway\b|\blawrence\b|\bargyle\b/.test(streetLower)) return 'Uptown';
    return 'Uptown';
  }

  // 60626 — Rogers Park
  if (zip === '60626') return 'Rogers Park';

  // 60659 — West Ridge / Devon Ave
  if (zip === '60659') return 'Devon Ave';

  // 60625 — Albany Park / North Park
  if (zip === '60625') {
    if (/\bpulaski\b|\bbryn mawr\b|\bbalmoral\b|\bfoster\b/.test(streetLower)) return 'North Park';
    return 'Albany Park';
  }

  // 60618 — North Center / Roscoe Village
  if (zip === '60618') {
    if (/\broscoe\b|\bdamen\b/.test(streetLower)) return 'Roscoe Village';
    return 'North Center';
  }

  // 60609 — Back of the Yards / Canaryville
  if (zip === '60609') {
    if (/\b47th\b|\b43rd\b|\bashland\b/.test(streetLower)) return 'Back of the Yards';
    return 'Back of the Yards';
  }

  // 60632 — Brighton Park / Archer Heights
  if (zip === '60632') {
    if (/\barcher\b/.test(streetLower)) return 'Archer Heights';
    return 'Brighton Park';
  }

  // 60629 — Chicago Lawn / Marquette Park
  if (zip === '60629') return 'Chicago Lawn';

  // 60636 — West Englewood
  if (zip === '60636') return 'West Englewood';

  // 60615 — Hyde Park
  if (zip === '60615') return 'Hyde Park';
  // 60637 — Hyde Park / Woodlawn
  if (zip === '60637') return 'Hyde Park';

  // 60612 — Near West Side / Medical District
  if (zip === '60612') return 'Near West Side';

  // 60624 — Humboldt Park / East Garfield Park
  if (zip === '60624') {
    if (/\bdivision\b|\bnorth\b|\bcalifornia\b/.test(streetLower)) return 'Humboldt Park';
    return 'Humboldt Park';
  }

  // 60651 — Humboldt Park / West Humboldt
  if (zip === '60651') return 'Humboldt Park';

  // 60639 — Belmont Cragin / Hermosa
  if (zip === '60639') {
    if (/\bfullerton\b|\bdiversey\b/.test(streetLower)) return 'Belmont Cragin';
    return 'Belmont Cragin';
  }

  // 60641 — Portage Park / Old Irving
  if (zip === '60641') {
    if (/\birving\b/.test(streetLower)) return 'Old Irving Park';
    return 'Portage Park';
  }

  // 60605 — South Loop / Printer's Row
  if (zip === '60605') return 'South Loop';

  // 60601/60602/60603/60604 — The Loop (Downtown)
  if (zip === '60601' || zip === '60602' || zip === '60603' || zip === '60604') return 'The Loop';

  // 60611 — Streeterville / Mag Mile
  if (zip === '60611') return 'Streeterville';

  // 60642 — Goose Island / Near North
  if (zip === '60642') return 'Noble Square';

  // 60660 — Edgewater
  if (zip === '60660') return 'Edgewater';

  // 60645 — West Ridge / Peterson Park
  if (zip === '60645') return 'West Ridge';

  // 60653 — Bronzeville / Douglas
  if (zip === '60653') {
    if (/\bcottage\b|\bking\b|\bdrexel\b/.test(streetLower)) return 'Bronzeville';
    return 'Bronzeville';
  }

  // 60619 — Chatham / Avalon Park
  if (zip === '60619') return 'Chatham';

  // 60621 covers Englewood + Greater Grand Crossing edge
  // 60637 can also bleed into Grand Crossing
  // 60629 south end touches Chicago Lawn / West Englewood

  // 60620 — Auburn Gresham
  if (zip === '60620') return 'Auburn Gresham';

  // 60617 — South Chicago / South Shore
  if (zip === '60617') return 'South Chicago';

  // 60649 — South Shore
  if (zip === '60649') return 'South Shore';

  // 60630 — Jefferson Park
  if (zip === '60630') return 'Jefferson Park';

  // 60631 — Edison Park / Norwood Park
  if (zip === '60631') return 'Edison Park';

  // 60634 — Dunning / Montclare
  if (zip === '60634') return 'Dunning';

  // 60644 — Austin
  if (zip === '60644') return 'Austin';

  // 60621 — Englewood
  if (zip === '60621') return 'Englewood';

  // 60628 — Roseland / Pullman
  if (zip === '60628') {
    if (/\bpullman\b|\b111th\b|\bcottage\b/.test(streetLower)) return 'Pullman';
    return 'Roseland';
  }

  // 60638 — Clearing / Garfield Ridge
  if (zip === '60638') {
    if (/\b63rd\b|\bcicero\b|\bcentral\b/.test(streetLower)) return 'Clearing';
    return 'Garfield Ridge';
  }

  // 60652 — Ashburn / West Beverly / Clearing (south)
  if (zip === '60652') return 'Ashburn';

  // 60655 — Mount Greenwood
  if (zip === '60655') return 'Mount Greenwood';

  // 60643 — Morgan Park / Beverly
  if (zip === '60643') {
    if (/\bwestern\b|\b103rd\b|\b104th\b|\b105th\b/.test(streetLower)) return 'Beverly';
    return 'Morgan Park';
  }

  // 60636 — West Englewood (confirm present)
  if (zip === '60636') return 'West Englewood';

  // 60624 — East Garfield Park
  if (zip === '60624') return 'East Garfield Park';

  // 60644 covers Austin AND West Garfield Park — disambiguate
  // (already have 60644 → Austin above, add Garfield Park check)

  // 60612 — Near West Side / West Garfield Park (east end)
  if (zip === '60612') {
    if (/\bpulaski\b|\bkostner\b|\bkildare\b/.test(streetLower)) return 'West Garfield Park';
    return 'Near West Side';
  }

  // ── Chicago suburbs (by ZIP) ──
  if (zip === '60804' || zip === '60805') return 'Cicero';
  if (zip === '60402') return 'Berwyn';
  if (zip === '60201' || zip === '60202') return 'Evanston';
  if (zip === '60173' || zip === '60194') return 'Schaumburg';
  if (zip === '60453' || zip === '60454') return 'Oak Lawn';
  if (zip === '60805') return 'Evergreen Park';
  if (zip === '60459') return 'Burbank';

  // ── Indiana (by ZIP prefix) ──
  if (zip && zip.startsWith('460')) return null; // Indianapolis — let Google handle
  if (zip && zip.startsWith('463')) return null; // Fort Wayne
  if (zip && zip.startsWith('464')) return null; // Gary/NW Indiana

  return null; // unknown — don't guess
}

// Detect street food / carts / trucks — these shouldn't have "restaurant" appended
const STREET_FOOD_KEYWORDS = /\b(cart|truck|stand|vendor|paletero|elotero|tamale|tamal|street food|food truck|pop-?up|market|mercado|feria|tianguis|puesto)\b/i;

async function lookupRealNeighborhood(name, city) {
  if (!name) return null;

  const cacheKey = `${name}|${city}`.toLowerCase();
  const cached = placeCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PLACE_CACHE_TTL) return cached.data;

  const apiKey = process.env.GOOGLE_PLACES_KEY;
  if (!apiKey) return null;

  try {
    // Strip "— Neighborhood" suffix from name if present (AI often adds it)
    const cleanName = name.replace(/\s*[—–-]\s*[A-Z][a-zA-Z\s]+$/, '').trim();
    const isStreet = STREET_FOOD_KEYWORDS.test(cleanName);
    const geo = getSearchGeo(city);

    // Try 1: search with appropriate suffix
    const suffix = isStreet ? '' : ' restaurant';
    let result = await _placesLookup(`${cleanName}${suffix} ${city}`, geo, apiKey, city);

    // Try 2: if no result, retry without suffix (catches non-standard business names)
    if (!result && !isStreet) {
      result = await _placesLookup(`${cleanName} ${city}`, geo, apiKey, city);
    }

    // Try 3: if still nothing, try just the name + "food" + city (broadest search)
    if (!result) {
      result = await _placesLookup(`${cleanName} food ${city}`, geo, apiKey, city);
    }

    placeCache.set(cacheKey, { data: result, ts: Date.now() });
    if (placeCache.size > 500) {
      const oldest = placeCache.keys().next().value;
      placeCache.delete(oldest);
    }
    return result;
  } catch (err) {
    console.error(`Places lookup failed for "${name}":`, err.message);
    return null;
  }
}

// Core Google Places Text Search call — extracted for retry logic
async function _placesLookup(textQuery, geo, apiKey, city) {
  try {
    const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.formattedAddress,places.addressComponents,places.displayName',
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: 1,
        locationBias: {
          circle: {
            center: { latitude: geo.lat, longitude: geo.lng },
            radius: 80000,
          },
        },
      }),
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    const place = data.places?.[0];
    if (!place) return null;

    // Extract neighborhood — our ZIP+street resolver takes priority for Chicago
    // Google's addressComponents often returns wrong/generic names like "Lower West Side"
    // instead of what Chicagoans actually call these neighborhoods
    let neighborhood = null;
    let realAddress = place.formattedAddress || null;
    const cityBase = city.toLowerCase().split(',')[0].trim();

    // Step 1: ALWAYS try our Chicago resolver first — it's more accurate than Google
    if (realAddress) {
      neighborhood = resolveChicagoNeighborhood(realAddress);
      if (neighborhood) {
        console.log(`🏘️ Resolver: "${realAddress}" → ${neighborhood}`);
      }
    }

    // Step 2: If resolver didn't match (non-Chicago city, unknown ZIP), fall back to Google
    if (!neighborhood && place.addressComponents) {
      const hoodComp = place.addressComponents.find(c =>
        c.types?.includes('neighborhood') || c.types?.includes('sublocality') || c.types?.includes('sublocality_level_1'));
      const localityComp = place.addressComponents.find(c => c.types?.includes('locality'));
      const locality = localityComp?.longText || null;
      neighborhood = hoodComp?.longText || (locality && locality.toLowerCase() !== cityBase ? locality : null);
    }

    if (!neighborhood && !realAddress) return null; // completely useless result
    const displayName = place.displayName?.text || null;
    return { neighborhood, address: realAddress, displayName };
  } catch (err) {
    console.error(`_placesLookup failed for "${textQuery}":`, err.message);
    return null;
  }
}

// Extract cuisine keyword from a result's name/description for fallback searches
function extractCuisine(result) {
  const text = `${result.name || ''} ${result.description || ''}`.toLowerCase();
  const cuisineMap = [
    [/\b(thai|pad thai|pad see ew|tom yum|green curry|sticky rice)\b/, 'Thai'],
    [/\b(mexican|taco|burrito|birria|pozole|tamale|elote|enchilada|quesadilla|torta|al pastor)\b/, 'Mexican'],
    [/\b(korean|bibimbap|bulgogi|kimchi|korean bbq)\b/, 'Korean'],
    [/\b(japanese|sushi|ramen|udon|tempura|izakaya)\b/, 'Japanese'],
    [/\b(chinese|dim sum|dumpling|wonton|szechuan|sichuan|cantonese|lo mein|fried rice)\b/, 'Chinese'],
    [/\b(italian|pizza|pasta|risotto|gelato|trattoria)\b/, 'Italian'],
    [/\b(indian|curry|tikka|naan|biryani|tandoori|masala)\b/, 'Indian'],
    [/\b(ethiopian|injera|wat|kitfo)\b/, 'Ethiopian'],
    [/\b(vietnamese|pho|banh mi|bun)\b/, 'Vietnamese'],
    [/\b(soul food|fried chicken|catfish|mac and cheese|collard|cornbread)\b/, 'soul food'],
    [/\b(bbq|brisket|ribs|smoked|barbecue|pulled pork)\b/, 'BBQ'],
    [/\b(mediterranean|falafel|shawarma|hummus|gyro|kebab)\b/, 'Mediterranean'],
    [/\b(colombian|arepa|bandeja|empanada colombiana)\b/, 'Colombian'],
    [/\b(puerto rican|jibarito|mofongo|pasteles)\b/, 'Puerto Rican'],
    [/\b(salvadoran|pupusa)\b/, 'Salvadoran'],
    [/\b(peruvian|ceviche|lomo saltado)\b/, 'Peruvian'],
    [/\b(breakfast|brunch|pancake|waffle|egg|coffee|café|cafe|latte|cortado)\b/, 'breakfast'],
    [/\b(seafood|fish|shrimp|lobster|crab|oyster|mariscos)\b/, 'seafood'],
    [/\b(burger|sandwich|deli|sub)\b/, 'burger'],
    [/\b(dessert|ice cream|churro|pastry|cake|bakery|dulce)\b/, 'dessert'],
  ];
  for (const [regex, cuisine] of cuisineMap) {
    if (regex.test(text)) return cuisine;
  }
  return 'restaurant'; // generic fallback
}

// Verify all results in parallel — replace AI's guessed neighborhoods with Google's real data
// If name lookup fails (hallucinated name), falls back to cuisine+area search
// Shorten long Google neighborhood names that overflow UI
function shortenNeighborhood(hood) {
  if (!hood) return hood;
  const shortMap = {
    'Greater Grand Crossing': 'Grand Crossing',
    'West Garfield Park': 'W Garfield Park',
    'East Garfield Park': 'E Garfield Park',
    'Ukrainian Village': 'Ukr. Village',
    'Near West Side': 'Near West',
    'Near North Side': 'Near North',
    'Near South Side': 'Near South',
    'North Center': 'North Center',
    'Old Irving Park': 'Old Irving',
    'Belmont Cragin': 'Belmont Cragin',
    'Mount Greenwood': 'Mt Greenwood',
    'Jefferson Park': 'Jefferson Pk',
  };
  return shortMap[hood] || hood;
}

async function verifyNeighborhoods(results, city) {
  if (!results || results.length === 0) return results;
  const apiKey = process.env.GOOGLE_PLACES_KEY;
  const geo = getSearchGeo(city);

  const promises = results.map(async (r) => {
    try {
      // Step 0: If AI returned an address, try our ZIP resolver FIRST (most accurate for Chicago)
      // This avoids Google returning a DIFFERENT restaurant with the same name in a different neighborhood
      if (r.address) {
        const resolvedHood = resolveChicagoNeighborhood(r.address);
        if (resolvedHood) {
          if (resolvedHood !== r.neighborhood) {
            console.log(`🏘️ ZIP resolver corrected: "${r.neighborhood}" → "${resolvedHood}" for ${r.name} (${r.address})`);
          }
          const shortHood = shortenNeighborhood(resolvedHood);
          r.neighborhood = shortHood;
          if (r.name && r.name.includes(' — ')) {
            r.name = r.name.split(' — ')[0] + ' — ' + shortHood;
          }
          return r; // Trust AI's address + our resolver over Google name lookup
        }
      }

      // Step 1: Try name lookup (works for real restaurant names)
      const realData = await lookupRealNeighborhood(r.name, city);
      if (realData) {
        if (realData.neighborhood) {
          if (realData.neighborhood !== r.neighborhood) {
            console.log(`🏘️ Neighborhood corrected: "${r.neighborhood}" → "${realData.neighborhood}" for ${r.name}`);
          }
          const shortHood2 = shortenNeighborhood(realData.neighborhood);
          r.neighborhood = shortHood2;
          if (r.name && r.name.includes(' — ')) {
            r.name = r.name.split(' — ')[0] + ' — ' + shortHood2;
          }
        }
        if (realData.address) {
          r.address = realData.address;
        }
        return r;
      }

      // Step 2: Name not found (likely hallucinated) — fallback to cuisine+city search
      // DON'T include AI's neighborhood in query — it's likely wrong and creates self-fulfilling prophecy
      // Just search for cuisine type in the city and let Google + our resolver determine the real neighborhood
      if (apiKey) {
        const cuisine = extractCuisine(r);
        const fallbackQuery = `best ${cuisine} restaurant ${city}`.trim();
        console.log(`🏘️ Name lookup failed for "${r.name}" — trying fallback: "${fallbackQuery}"`);

        const fallback = await _placesLookup(fallbackQuery, geo, apiKey, city);
        if (fallback) {
          const oldName = r.name;
          // Replace name with real restaurant found by Google (keeps cuisine match)
          if (fallback.displayName) {
            const shortHood3 = fallback.neighborhood ? shortenNeighborhood(fallback.neighborhood) : '';
            r.name = `${fallback.displayName}${shortHood3 ? ' — ' + shortHood3 : ''}`;
          }
          if (fallback.neighborhood) {
            r.neighborhood = shortenNeighborhood(fallback.neighborhood);
          }
          if (fallback.address) {
            r.address = fallback.address;
          }
          console.log(`🏘️ Replaced hallucinated "${oldName}" → real "${r.name}" (${r.neighborhood})`);
          return r;
        }
      }

      console.log(`🏘️ All lookups failed for "${r.name}" — keeping AI data`);
      return r;
    } catch (err) {
      console.error(`🏘️ Verification error for "${r.name}":`, err.message);
      return r; // Return original data instead of crashing
    }
  });

  return Promise.all(promises);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Sabor-Key");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  // ── Security gates ────────────────────────────────────────────────────────
  if (!checkAppKey(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const clientIp = getClientIp(req);
  const rl = checkRateLimit(clientIp, 'search', 20, 60_000); // 20 req/min per IP
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too many requests', retryAfter: rl.retryAfter });
  }
  // ─────────────────────────────────────────────────────────────────────────

  const {
    query,
    city = "Chicago, IL",
    tier: clientTier = "free",  // client-sent tier — verified server-side below
    rcUserId = null,             // RevenueCat app user ID (= Firebase UID)
    cuisines = [],
    diets = [],
    vibes = [],
    profileContext = "Usuario nuevo",
    tasteProfile = "",
    currentNeighborhood = null,
    favoriteNeighborhoods = [],
    filterNeighborhood = null,
    previousRestaurants = [],
    language = 'es',
    conSabor = false,
    localHour = null,
  } = req.body;

  if (!query) return res.status(400).json({ error: "Query is required" });

  // ── Server-side tier verification ─────────────────────────────────────────
  // Ignores client-sent tier entirely when REVENUECAT_SECRET_KEY is set.
  // Falls back to clientTier only during development (RC not configured yet).
  const rcTier = await verifyTierFromRC(rcUserId);
  const tier = rcTier !== null ? rcTier : clientTier;
  // ─────────────────────────────────────────────────────────────────────────

  // Truncate user input arrays to prevent token overflow in AI prompt
  const safePreviousRestaurants = (previousRestaurants || []).slice(-8);
  const safeFavoriteNeighborhoods = (favoriteNeighborhoods || []).slice(0, 5);
  const safeCuisines = (cuisines || []).slice(0, 10);
  const safeDiets = (diets || []).slice(0, 10);
  const safeVibes = (vibes || []).slice(0, 5);

  // Fetch trending terms to boost relevant results
  let trendingContext = '';
  // Trends are supplementary - skip to avoid adding latency

  // Random seed to force variety in results
  const rotationSeeds = [
    'Focus on lesser-known spots that locals love but tourists miss.',
    'Prioritize spots that have been trending in the last 30 days.',
    'Focus on hidden gems with under 500 reviews but exceptional quality.',
    'Highlight spots from underrepresented neighborhoods.',
    'Focus on spots with the most unique or signature dishes.',
  ];
  const seed = rotationSeeds[Math.floor(Math.random() * rotationSeeds.length)];

  const tierConfig = TIER_CONFIG[tier] || TIER_CONFIG.free;
  const isPremium = tier === "premium";
  const hasCredits = tier === "credits";
  const hasProfile = safeCuisines.length > 0 || safeDiets.length > 0 || safeVibes.length > 0;

  // Build neighborhood context
  let neighborhoodContext = "";
  if (isPremium && filterNeighborhood) {
    const vibe = NEIGHBORHOOD_VIBES[filterNeighborhood] || "";
    neighborhoodContext = language === 'en'
      ? `The user is filtering by: ${filterNeighborhood} (known for: ${vibe}). ALL results must be from this neighborhood.`
      : `El usuario filtra por: ${filterNeighborhood} (conocido por: ${vibe}). Todos los resultados deben ser de este barrio.`;
  } else if (currentNeighborhood) {
    const vibe = NEIGHBORHOOD_VIBES[currentNeighborhood] || "";
    neighborhoodContext = language === 'en'
      ? `The user is currently in ${currentNeighborhood} (${vibe}). PRIORITIZE spots near ${currentNeighborhood} and neighboring areas to minimize travel time. Start with the closest options first, then expand outward. At least half the results should be within 15 minutes of ${currentNeighborhood}.`
      : `El usuario está en ${currentNeighborhood} (${vibe}). PRIORIZA spots cerca de ${currentNeighborhood} y barrios vecinos para minimizar tiempo de viaje. Empieza con las opciones más cercanas, luego expande. Al menos la mitad de los resultados deben estar a 15 minutos de ${currentNeighborhood}.`;
    if (isPremium && safeFavoriteNeighborhoods.length > 0) {
      neighborhoodContext += language === 'en'
        ? ` Favorite neighborhoods: ${safeFavoriteNeighborhoods.join(", ")}.`
        : ` Barrios favoritos: ${safeFavoriteNeighborhoods.join(", ")}.`;
    }
  }

  // Rotation instruction
  const rotationNote = safePreviousRestaurants.length > 0
    ? `NUNCA repitas estos restaurantes: ${safePreviousRestaurants.join(", ")}.`
    : "";

  // Detect plan queries early (needed by personalization)
  const isPlanQuery = query.toLowerCase().includes('plan my full food day');

  // Time-aware planning — use client's local hour (phone knows real timezone)
  // Fall back to server UTC if client doesn't send it
  const parsedHour = localHour != null ? parseInt(localHour) : NaN;
  const currentHour = (!isNaN(parsedHour) && parsedHour >= 0 && parsedHour <= 23) ? parsedHour : new Date().getHours();
  // Determine remaining meals based on current time
  let timeContext = '';
  let planStops = 4;
  if (isPlanQuery) {
    if (currentHour >= 20) {        // 8pm+: late night only
      timeContext = `CURRENT TIME: ${currentHour}:00 (late evening). The user is planning NOW at night. ONLY plan dinner and/or late-night food — exactly 2 stops. DO NOT suggest breakfast, morning coffee, brunch, or lunch — those are IMPOSSIBLE at this hour. Use meal labels like "Dinner" or "Late Night", never "Morning" or "Lunch".`;
      planStops = 2;
    } else if (currentHour >= 17) { // 5-8pm: dinner + dessert
      timeContext = `CURRENT TIME: ${currentHour}:00 (evening). Plan dinner + dessert/drinks — exactly 3 stops. DO NOT suggest breakfast or lunch — those are past. Use labels like "Dinner", "Dessert", "After-Dinner Drinks".`;
      planStops = 3;
    } else if (currentHour >= 14) { // 2-5pm: afternoon snack + dinner
      timeContext = `CURRENT TIME: ${currentHour}:00 (mid-afternoon). Skip breakfast and lunch (too late). Start with an afternoon coffee or snack, then plan dinner. Exactly 3 stops. Use labels like "Afternoon Snack", "Dinner".`;
      planStops = 3;
    } else if (currentHour >= 11) { // 11am-2pm: lunch onward
      timeContext = `CURRENT TIME: ${currentHour}:00 (around lunchtime). Skip breakfast (too late). Start with lunch, then afternoon snack, then dinner. Exactly 3 stops.`;
      planStops = 3;
    } else {                         // Before 11am: full day
      timeContext = `CURRENT TIME: ${currentHour}:00 (morning). Plan the full day: breakfast/coffee, lunch, afternoon snack, and dinner. 4 stops.`;
      planStops = 4;
    }
  }

  // Personalization
  const personalization = hasProfile
    ? (language === 'en'
      ? `User profile: ${profileContext}. Dietary needs: ${safeDiets.join(", ") || "no restrictions"}. Preferred cuisines: ${safeCuisines.join(", ") || "open to all"}. Vibe: ${safeVibes.join(", ") || "any"}.${isPlanQuery ? ' IMPORTANT: All dish recommendations MUST respect these dietary preferences. Do not suggest dishes that conflict with the user\'s diet.' : ''}`
      : `Perfil: ${profileContext}. Dieta: ${safeDiets.join(", ") || "sin restricciones"}. Cocinas preferidas: ${safeCuisines.join(", ") || "abierto a todo"}. Ambiente: ${safeVibes.join(", ") || "cualquiera"}.${isPlanQuery ? ' IMPORTANTE: Todas las recomendaciones de platillos DEBEN respetar estas preferencias dietéticas. No sugieras platillos que contradigan la dieta del usuario.' : ''}`)
    : (language === 'en' ? "New user — suggest representative variety." : "Usuario nuevo — sugiere variedad representativa.");

  // Taste Graph — learned preferences from user reactions (🔥 loved, 😐 meh, ❌ miss)
  const tasteContext = tasteProfile
    ? (language === 'en'
      ? `\n\nTASTE GRAPH (learned from user visits):\n${tasteProfile}\nUse this to personalize — lean into what they love, avoid what they disliked, and occasionally surprise them with something new that matches their pattern.`
      : `\n\nGRAFO DE SABOR (aprendido de visitas del usuario):\n${tasteProfile}\nUsa esto para personalizar — inclínate hacia lo que aman, evita lo que no les gustó, y de vez en cuando sorpréndelos con algo nuevo que coincida con su patrón.`)
    : '';

  // Tag logic
  const tagInstruction = isPremium
    ? `Tags disponibles: 🔥 viral, 💎 gema oculta, ⭐ Para ti (si coincide con perfil), 🏙️ [Barrio] exclusivo`
    : hasCredits
    ? `Tags disponibles: 🔥 viral, 💎 gema oculta, ⭐ Para ti (si coincide con perfil)`
    : `Tags: 🔥 viral, 📍 ${language === 'en' ? 'near you' : 'cerca de ti'}`;

  // Smart query classifier
  const latinKeywords = ['latin','latino','latina','mexican','taco','burrito',
    'colombian','cuban','puerto rican','dominican','salvadoran','peruvian',
    'argentinian','birria','pozole','tamale','enchilada','cubano','mofongo',
    'arepa','empanada','ceviche','mexicano','mexicana','colombiana','cubana',
    'tacos','burritos','pupusa','yuca','plantain','platano'];
  const streetFoodKeywords = ['taco truck','elote','elotero','tamalera','tamale vendor',
    'paletero','paleta','fruit cart','frutero','puesto','street taco','antojitos',
    'troca','esquite','street vendor','street food','street corn','food cart',
    'hot dog cart','corn man','raspado','raspados','churro cart','tamales lady',
    'food truck','lonchera','taquero','ambulante','vendedor','carrito'];
  const isStreetFood = streetFoodKeywords.some(k => query.toLowerCase().includes(k));
  const isLatinQuery = latinKeywords.some(k => query.toLowerCase().includes(k));
  const foodContext = isPlanQuery
    ? (language === 'en' ? 'personal food concierge covering ALL cuisines' : 'concierge personal de comida de TODAS las cocinas')
    : (isLatinQuery || conSabor)
    ? (language === 'en' ? 'Latin food specialist' : 'especialista en comida latina')
    : (language === 'en' ? 'general food discovery expert' : 'experto gastronómico general');

  // Check cache first (skip cache for street food / vendor / similar - always fresh)
  const cacheKey = getCacheKey(query, city, tier, language, filterNeighborhood, currentNeighborhood, diets) + (conSabor ? '|cs' : '');
  const skipCache = isStreetFood
    || query.toLowerCase().includes('vendor')
    || query.toLowerCase().includes('truck')
    || query.toLowerCase().includes('similar to')
    || query.toLowerCase().includes('plan my');
  if (!skipCache) {
    const cached = getCached(cacheKey);
    if (cached) {
      console.log('Cache hit:', cacheKey);
      return res.status(200).json(cached);
    }
  }

  try {
    // 55s timeout to stay under Vercel's 60s limit
    const aiTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Claude API timeout after 55s')), 55000)
    );
    const message = await Promise.race([aiTimeout, client.messages.create({
      model: tier === "premium" ? "claude-sonnet-4-20250514" : "claude-haiku-4-5-20251001",
      max_tokens: isPlanQuery ? 1800 : (tier === 'premium' ? 1400 : 700),
      messages: [
        {
          role: "user",
          content: language === 'en'
          ? `You are SABOR — not a generic food finder, but a bold, warm, opinionated food friend who knows every block. You speak with flavor: vivid, confident, the kind of friend who grabs your arm and says "trust me, you NEED to try this." You're a ${foodContext} in ${city}.${conSabor ? ' CON SABOR MODE: You bridge every cuisine through Latin culture. Compare dishes to Latin equivalents ("this broth hits like a good pozole"), suggest a Latin pairing for each spot ("pair it with a horchata from the shop next door"), and drop cultural knowledge that connects food traditions across the world. You celebrate ALL cuisines through the lens of someone raised on Latin flavors.' : ''}

${isPlanQuery ? `TIME AWARENESS: ${timeContext}\n\nCreate a food itinerary starting from NOW. ONLY include meals that make sense for the current time — do NOT suggest breakfast at 7pm or lunch at 9pm. ${planStops <= 2 ? 'Keep it tight — ' + planStops + ' stops max.' : 'Plan ' + planStops + ' stops.'} IMPORTANT: Mix different cuisines across the stops — do NOT make every stop the same cuisine. Include a variety (e.g. a coffee shop for morning, maybe a Thai or Japanese lunch, a Mexican snack spot, an Italian dinner). Respect the user\'s preferences but add variety. For EACH stop, recommend specific menu items with dollar prices for EACH person (e.g. "Cortado $4.50, Avocado Toast $11"). If this is for multiple people, list items per person and show the combined cost.\n\nBUDGET & TIPS: The user\'s stated budget is their TOTAL spend including tips. Reserve 20% of the budget for tips. For example, if budget is $100, plan food totaling ~$83 max, then add ~$17 tip. Show the running total AFTER each stop like: "Food: $14.50 + tip ~$2.90 · Running total: $17.40 / $100". For coffee shops or counter-service spots, use 15% tip. For sit-down restaurants, use 20%. The FINAL grand total (food + all tips) MUST stay under the stated budget. NEVER roll over into the next day — no planning breakfast for tomorrow if budget remains. When the day is done or budget is spent, stop.\n\nUse real restaurant names and neighborhoods in Chicago. Include the neighborhood in each result\'s "neighborhood" field.` : isStreetFood ? `Find ONLY street vendors, food carts, taco trucks, and informal street food sellers for: "${query}".\n\nSTRICT RULES — what IS street food:\n- Taco trucks / trocas / loncheras parked on streets or in lots\n- Cart vendors (elote, tamale, paleta, fruit, hot dog carts)\n- Food trucks at regular spots or rotating locations\n- Informal stands or pop-ups (not in a building)\n\nWhat is NOT street food (NEVER include these):\n- Sit-down restaurants, even casual ones\n- Bakeries, cafes, or coffee shops\n- Fast food chains\n- Restaurants that serve street-style food indoors (e.g. a taquería with tables is a RESTAURANT, not street food)\n- Food halls or market stalls inside permanent buildings\n\nFor each result include: typical location (intersection, parking lot, or route), days/hours they usually operate, and the neighborhood. If you don\'t know exact hours, say "hours vary — check locally".` : (isLatinQuery || conSabor) ? 'Find ONLY Latin, Hispanic, or Latino-owned restaurants for this search — Mexican, Colombian, Cuban, Puerto Rican, Salvadoran, Peruvian, Dominican, Venezuelan, or any other Latin American cuisine. Do NOT return non-Latin restaurants.' : 'Find the BEST restaurants for this search across ALL cuisines. Do NOT default to Latin food unless asked.'}

${neighborhoodContext}
${personalization}${tasteContext}
${rotationNote}

Search: "${query}"

${seed}${trendingContext}

${tagInstruction}

Respond ONLY with valid JSON — no markdown, no backticks:
{
  "summary": "${isPlanQuery ? "1-2 bold sentences previewing the day plan with total budget — speak with personality, hype the journey" : `1-2 vibrant sentences with personality — be opinionated, name specific flavors or dishes that make this search exciting${isPremium ? ", mention the neighborhood vibe" : ""}`}",
  "neighborhood": "${currentNeighborhood || "Chicago"}",
  "results": [
    {
      "name": "Name — Exact Neighborhood",
      "emoji": "food emoji",
      "description": "${isPlanQuery ? "List dishes with prices: Cortado $4.50, Churro $3 · Food: $7.50 + tip $1.13 · Running total: $8.63 / $100" : conSabor ? "2 vivid sentences — describe the food with passion, then bridge it to Latin culture (compare flavors, suggest a Latin pairing, or connect food traditions). Be specific about dishes." : "2 vivid sentences about the spot — be opinionated, mention specific dishes and what makes them hit different. No generic praise."}",
      "tag": "${isPlanQuery ? 'meal period label for this stop — e.g. Breakfast, Lunch, Afternoon Snack, Dinner, Late Night, Dessert, Drinks (must match current time)' : 'appropriate tag based on tier'}",
      "distance": "0.0mi",
      "address": "full street address with ZIP (e.g. 1234 W 18th St, Chicago, IL 60608)",
      "neighborhood": "actual Chicago neighborhood name"
    }
  ]
}

Critical rules:
- Exactly ${isPlanQuery ? String(planStops) : (tier === 'premium' ? '6' : '3')} unique results${isPlanQuery ? `\n- TIME IS ${currentHour}:00 — ONLY use meal labels appropriate for this hour. After 5pm: "Dinner", "Late Night", "Dessert", "Drinks". NEVER use "Morning", "Breakfast", "Brunch", or "Lunch" after 5pm. NEVER use "Dinner" or "Late Night" before noon.` : ''}
- ${rotationNote || "Vary the restaurants"}
- Respect radius ${tierConfig.radius}
- ${isPremium ? "Can recommend from any neighborhood in Chicago" : `Stay within ${tierConfig.radius} of the user`}
- INDEPENDENT SPOTS ONLY: NEVER recommend chain restaurants or fast food brands — this includes local chains with multiple locations. Banned: Harold's Chicken, Sharks Fish & Chicken, Portillo's, McDonald's, Burger King, Subway, Wendy's, Popeyes, Chick-fil-A, Chipotle, Panda Express, Olive Garden, Applebee's, or any brand with more than 3 metro-area locations. SABOR is for independent, family-owned spots only.
- REAL RESTAURANTS ONLY: Every restaurant you name MUST be a real, established business that exists on Google Maps RIGHT NOW. Do NOT invent creative names like "Elote Cart on Cermak" or "Night Taco Truck on Archer" — these are made up. Use the restaurant's ACTUAL business name as it appears on Google Maps or Yelp (e.g. "Taquería Los Comales", "Joy Yee's Noodles", "Avec"). If you are not 95% certain a restaurant exists with that exact name, pick a well-known restaurant you ARE certain about instead.
- NEIGHBORHOOD ACCURACY: The "neighborhood" field MUST match the restaurant's REAL physical location. Chicago neighborhood boundaries:
  • Chinatown = Wentworth Ave corridor, roughly Cermak (22nd) to 26th St. ONLY restaurants ON or NEAR Wentworth/Archer between 22nd-26th are Chinatown.
  • Pilsen = 16th-22nd St, Halsted to Western (murals, Mexican classics)
  • Little Village = 26th St corridor, California to Kostner (La Villita)
  • West Town / Ukrainian Village = Chicago Ave to Division, Ashland to Western
  • Logan Square = Milwaukee Ave corridor near California/Kedzie
  • Wicker Park = Milwaukee/North/Damen triangle
  • Bridgeport = 31st-35th St, Halsted to Ashland (south of Sox park)
  • Lakeview = Belmont to Irving Park, lakefront to Ravenswood
  A restaurant on W Chicago Ave is West Town, NOT Chinatown. A restaurant on N Halsted near Belmont is Lakeview, NOT Chinatown. Do NOT cluster all results in one famous neighborhood.
- The "address" field MUST be the restaurant's REAL street address with ZIP code — the same address that appears on Google Maps. Do NOT invent or approximate addresses.${isStreetFood ? '\n- STREET FOOD ONLY: Every result must be a mobile vendor, cart, truck, or informal stand. If it has indoor seating and a permanent address, it is a RESTAURANT — do not include it.' : ''}
- SPREAD restaurants across DIFFERENT neighborhoods — do NOT put all results in the same neighborhood unless the user specifically asked for one area
- Never repeat the same 3 spots
- Write descriptions with FLAVOR — no bland generic sentences like "great atmosphere" or "worth a visit". Name specific dishes, textures, flavors.${conSabor ? '\n- CON SABOR: Every description MUST include a Latin cultural bridge — a comparison, pairing suggestion, or flavor connection to Latin cuisine.' : ''}`
          : `Eres SABOR — no un buscador genérico, sino un amigo foodie con sabor, opinión y calle. Hablas con calor: seguro, vibrante, como ese compa que te jala del brazo y dice "tienes que probar esto." Eres un ${foodContext} en ${city}.${conSabor ? ' MODO CON SABOR: Conectas cada cocina con la cultura latina. Compara platillos con sus equivalentes latinos ("este caldo pega como un buen pozole"), sugiere un complemento latino para cada spot ("acompáñalo con una horchata de la tienda de al lado"), y suelta conocimiento cultural que conecta tradiciones culinarias del mundo. Celebras TODAS las cocinas a través de los ojos de alguien criado con sabores latinos.' : ''}

${isPlanQuery ? `HORA ACTUAL: ${timeContext}\n\nCrea un itinerario de comida empezando desde AHORA. SOLO incluye comidas que tengan sentido para la hora actual — NO sugieras desayuno a las 7pm ni almuerzo a las 9pm. ${planStops <= 2 ? 'Mantenlo corto — ' + planStops + ' paradas máximo.' : 'Planea ' + planStops + ' paradas.'} IMPORTANTE: Mezcla diferentes cocinas — NO hagas cada parada de la misma cocina. Incluye variedad (ej: cafetería por la mañana, almuerzo tailandés o japonés, snack mexicano, cena italiana). Respeta las preferencias del usuario pero agrega variedad. Para CADA parada, recomienda platillos específicos del menú con precios en dólares por CADA persona (ej: "Cortado $4.50, Avocado Toast $11"). Si es para varias personas, lista los items por persona y muestra el costo combinado.\n\nPRESUPUESTO Y PROPINAS: El presupuesto del usuario es su GASTO TOTAL incluyendo propinas. Reserva 20% del presupuesto para propinas. Ejemplo: si el presupuesto es $100, planea comida de ~$83 máximo, luego agrega ~$17 de propina. Muestra el total acumulado DESPUÉS de cada parada como: "Comida: $14.50 + propina ~$2.90 · Total acumulado: $17.40 / $100". Para cafeterías o servicio en mostrador, usa 15% propina. Para restaurantes con servicio en mesa, usa 20%. El TOTAL FINAL (comida + todas las propinas) DEBE quedar bajo el presupuesto indicado. NUNCA pases al día siguiente — no planees desayuno de mañana si sobra presupuesto. Cuando el día termine o el presupuesto se agote, para.\n\nUsa nombres reales de restaurantes y barrios de Chicago. Incluye el barrio en el campo "neighborhood" de cada resultado.` : isStreetFood ? `Encuentra SOLO vendedores ambulantes, carritos de comida, trocas y vendedores informales para: "${query}".\n\nREGLAS ESTRICTAS — qué SÍ es comida callejera:\n- Trocas / loncheras / taco trucks estacionados en calles o estacionamientos\n- Carritos (elote, tamales, paletas, fruta, hot dogs)\n- Food trucks en ubicaciones regulares o rotativas\n- Puestos informales o pop-ups (no en un edificio)\n\nQué NO es comida callejera (NUNCA incluyas estos):\n- Restaurantes con asientos, aunque sean casuales\n- Panaderías, cafeterías o coffee shops\n- Cadenas de fast food\n- Restaurantes que sirven comida estilo callejero pero adentro (una taquería con mesas es RESTAURANTE, no comida callejera)\n- Food halls o puestos dentro de edificios permanentes\n\nPara cada resultado incluye: ubicación típica (intersección, estacionamiento o ruta), días/horarios, y el barrio. Si no sabes horarios exactos, pon "horarios varían — confirma localmente".` : (isLatinQuery || conSabor) ? 'Encuentra SOLO restaurantes latinos o hispanos para esta búsqueda — mexicanos, colombianos, cubanos, puertorriqueños, salvadoreños, peruanos, dominicanos, venezolanos o cualquier cocina latinoamericana. NO incluyas restaurantes no latinos.' : 'Encuentra los MEJORES restaurantes en TODAS las cocinas. NO te limites a comida latina a menos que se pida.'}

${neighborhoodContext}
${personalization}${tasteContext}
${rotationNote}

Búsqueda: "${query}"

${tagInstruction}

Responde SOLO con JSON válido — sin markdown, sin backticks:
{
  "summary": "${isPlanQuery ? "1-2 frases con personalidad previsualizando el plan del día con presupuesto — habla con sabor, emociona al usuario" : `1-2 frases vibrantes con opinión — sé directo, nombra sabores o platillos específicos que hagan esta búsqueda emocionante${isPremium ? ", menciona la vibra del barrio" : ""}`}",
  "neighborhood": "${currentNeighborhood || "Chicago"}",
  "results": [
    {
      "name": "Nombre — Barrio exacto",
      "emoji": "emoji de comida",
      "description": "${isPlanQuery ? "Lista platillos con precios: Cortado $4.50, Churro $3 · Comida: $7.50 + propina $1.13 · Total acumulado: $8.63 / $100" : conSabor ? "2 frases vividas — describe la comida con pasión, luego conéctala con la cultura latina (compara sabores, sugiere un complemento latino, o conecta tradiciones). Sé específico con los platillos." : "2 frases vividas sobre el spot — sé opinado, menciona platillos específicos y qué los hace únicos. Nada de elogios genéricos."}",
      "tag": "${isPlanQuery ? 'etiqueta de período de comida — ej: Desayuno, Almuerzo, Snack, Cena, Late Night, Postre, Drinks (debe corresponder a la hora actual)' : 'tag apropiado según tier'}",
      "distance": "0.0mi",
      "address": "dirección completa con ZIP (ej: 1234 W 18th St, Chicago, IL 60608)",
      "neighborhood": "nombre real del barrio de Chicago"
    }
  ]
}

Reglas críticas:
- Exactamente ${isPlanQuery ? String(planStops) : (tier === 'premium' ? '6' : '3')} resultados únicos${isPlanQuery ? `\n- SON LAS ${currentHour}:00 — SOLO usa etiquetas de comida apropiadas para esta hora. Después de las 5pm: "Cena", "Late Night", "Postre", "Drinks". NUNCA uses "Mañana", "Desayuno", "Brunch", o "Almuerzo" después de las 5pm. NUNCA uses "Cena" o "Late Night" antes del mediodía.` : ''}
- ${rotationNote || "Varía los restaurantes"}
- Respeta radio ${tierConfig.radius}
- ${isPremium ? "Puedes recomendar de cualquier barrio de " + city : `Mantente dentro de ${tierConfig.radius} del usuario`}
- SOLO RESTAURANTES REALES: Cada restaurante DEBE ser un negocio real que existe en Google Maps AHORA MISMO. NO inventes nombres creativos como "Carrito de Elote en Cermak" o "Taco Truck Nocturno en Archer" — esos no existen. Usa el NOMBRE REAL del negocio como aparece en Google Maps o Yelp (ej: "Taquería Los Comales", "Joy Yee's Noodles", "Avec"). Si no estás 95% seguro de que el restaurante existe con ese nombre exacto, elige uno conocido del que SÍ estés seguro.
- PRECISIÓN DE BARRIO: El campo "neighborhood" DEBE coincidir con la ubicación REAL del restaurante. Límites de barrios en Chicago:
  • Chinatown = corredor Wentworth Ave, aprox. Cermak (22nd) a 26th St. SOLO restaurantes EN o CERCA de Wentworth/Archer entre 22nd-26th son Chinatown.
  • Pilsen = 16th-22nd St, Halsted a Western (murales, clásicos mexicanos)
  • Little Village = corredor 26th St, California a Kostner (La Villita)
  • West Town / Ukrainian Village = Chicago Ave a Division, Ashland a Western
  • Logan Square = corredor Milwaukee Ave cerca de California/Kedzie
  • Wicker Park = triángulo Milwaukee/North/Damen
  • Bridgeport = 31st-35th St, Halsted a Ashland (sur del Sox park)
  • Lakeview = Belmont a Irving Park, lakefront a Ravenswood
  Un restaurante en W Chicago Ave es West Town, NO Chinatown. Uno en N Halsted cerca de Belmont es Lakeview, NO Chinatown. NO agrupes todos en un solo barrio famoso.
- El campo "address" DEBE ser la dirección REAL del restaurante con ZIP — la misma que aparece en Google Maps. NO inventes ni aproximes direcciones.${isStreetFood ? '\n- SOLO COMIDA CALLEJERA: Cada resultado debe ser un vendedor móvil, carrito, troca o puesto informal. Si tiene asientos adentro y dirección permanente, es un RESTAURANTE — no lo incluyas.' : ''}
- DISTRIBUYE restaurantes en DIFERENTES barrios — NO pongas todos en el mismo barrio a menos que el usuario pida uno específico
- Nunca repitas los mismos 3 spots
- Escribe descripciones con SABOR — nada de frases genéricas como "gran ambiente" o "vale la pena". Nombra platillos, texturas, sabores específicos.${conSabor ? '\n- CON SABOR: Cada descripción DEBE incluir un puente cultural latino — una comparación, sugerencia de complemento, o conexión de sabores con la cocina latina.' : ''}`,
        },
      ],
    })]);

    if (!message?.content?.[0]?.text) {
      console.error("Claude returned empty response — content:", JSON.stringify(message?.content));
      return res.status(200).json({ summary: "Search hit a snag — try again", results: [] });
    }
    const raw = message.content[0].text.trim();
    console.log(`🔍 AI response length: ${raw.length} chars, model: ${tier === "premium" ? "sonnet" : "haiku"}, starts with: ${raw.substring(0, 80)}`);

    // Aggressive cleanup: remove markdown fences, thinking tags, preamble text before JSON
    let clean = raw
      .replace(/^```json\n?/gm, '')
      .replace(/^```\n?/gm, '')
      .replace(/\n?```$/gm, '')
      .replace(/<thinking>[\s\S]*?<\/thinking>/g, '') // remove thinking tags
      .trim();

    // If response doesn't start with {, try to find the JSON object
    if (!clean.startsWith('{')) {
      const jsonStart = clean.indexOf('{"');
      if (jsonStart !== -1) {
        console.log(`🔍 Trimming ${jsonStart} chars of preamble before JSON`);
        clean = clean.substring(jsonStart);
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      console.error("JSON parse failed. First 500 chars:", clean.substring(0, 500));
      // Attempt recovery: extract the largest JSON object
      try {
        const jsonMatch = clean.match(/\{[\s\S]*"results"[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
          console.log("🔍 JSON recovery succeeded via regex");
        } else {
          console.error("No JSON with 'results' found in response");
          return res.status(200).json({ summary: "Search hit a snag — try again", results: [] });
        }
      } catch (recoveryErr) {
        console.error("JSON recovery also failed:", recoveryErr.message);
        return res.status(200).json({ summary: "Search hit a snag — try again", results: [] });
      }
    }

    // Verify neighborhoods via Google Places name lookup (parallel, cached)
    // Looks up each restaurant NAME in Google → gets REAL address + neighborhood
    // This fixes AI-hallucinated addresses AND neighborhoods in one shot
    if (parsed.results) {
      try {
        parsed.results = await verifyNeighborhoods(parsed.results, city);
      } catch (verifyErr) {
        console.error('Neighborhood verification failed (returning unverified):', verifyErr.message);
        // Return results without verification rather than 500
      }
      try {
        parsed.results = await injectOwnerTiers(parsed.results);
      } catch (_) {} // never fail a search because of badge lookup
    }

    if (!skipCache) setCache(cacheKey, parsed);
    // Log search behavior for marketing intelligence (fire-and-forget)
    logSearch(query, city, tier, language, filterNeighborhood || currentNeighborhood);
    return res.status(200).json(parsed);
  } catch (err) {
    const errStatus = err.status || err.statusCode || null;
    const errType = err.error?.error?.type || err.type || null;
    console.error(`SABOR API error [${errStatus}] [${errType}]:`, err.message, JSON.stringify(err.error || {}).substring(0, 500));

    // Return a user-friendly error with a retry hint instead of raw 500
    const statusCode = errStatus === 529 ? 503 : 500;
    const userMessage = errType === 'overloaded_error'
      ? 'AI is busy — try again in a moment'
      : statusCode === 500
      ? 'Search hit a snag — try again'
      : err.message;

    return res.status(200).json({
      error: "Search failed",
      message: userMessage,
      summary: userMessage,
      results: [],
      status: errStatus,
      type: errType,
    });
  }
}
