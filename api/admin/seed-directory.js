// api/admin/seed-directory.js
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { scoutNeighborhood } from './scout-core.js';

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

const ALL_PAIRS = [
  // ── CHICAGO (25 neighborhoods) ──
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'pilsen',             neighborhoodLabel: 'Pilsen' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'little-village',     neighborhoodLabel: 'Little Village' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'humboldt-park',      neighborhoodLabel: 'Humboldt Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'east-garfield-park', neighborhoodLabel: 'East Garfield Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'west-garfield-park', neighborhoodLabel: 'West Garfield Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'back-of-the-yards',  neighborhoodLabel: 'Back of the Yards' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'brighton-park',      neighborhoodLabel: 'Brighton Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'gage-park',          neighborhoodLabel: 'Gage Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'logan-square',       neighborhoodLabel: 'Logan Square' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'avondale',           neighborhoodLabel: 'Avondale' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'wicker-park',        neighborhoodLabel: 'Wicker Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'albany-park',        neighborhoodLabel: 'Albany Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'uptown',             neighborhoodLabel: 'Uptown' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'lakeview',           neighborhoodLabel: 'Lakeview' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'lincoln-park',       neighborhoodLabel: 'Lincoln Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'rogers-park',        neighborhoodLabel: 'Rogers Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'bridgeport',         neighborhoodLabel: 'Bridgeport' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'chinatown',          neighborhoodLabel: 'Chinatown' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'bronzeville',        neighborhoodLabel: 'Bronzeville' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'hyde-park',          neighborhoodLabel: 'Hyde Park' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'west-loop',          neighborhoodLabel: 'West Loop' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'west-town',          neighborhoodLabel: 'West Town' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'river-north',        neighborhoodLabel: 'River North' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'cicero',             neighborhoodLabel: 'Cicero' },
  { city: 'chicago', cityLabel: 'Chicago, IL', neighborhood: 'berwyn',             neighborhoodLabel: 'Berwyn' },
  // ── AURORA ──
  { city: 'aurora', cityLabel: 'Aurora, IL', neighborhood: 'downtown-aurora',  neighborhoodLabel: 'Downtown Aurora' },
  { city: 'aurora', cityLabel: 'Aurora, IL', neighborhood: 'east-side',        neighborhoodLabel: 'East Side' },
  { city: 'aurora', cityLabel: 'Aurora, IL', neighborhood: 'new-york-street',  neighborhoodLabel: 'New York Street' },
  { city: 'aurora', cityLabel: 'Aurora, IL', neighborhood: 'fox-valley',       neighborhoodLabel: 'Fox Valley' },
  // ── JOLIET ──
  { city: 'joliet', cityLabel: 'Joliet, IL', neighborhood: 'downtown-joliet',   neighborhoodLabel: 'Downtown Joliet' },
  { city: 'joliet', cityLabel: 'Joliet, IL', neighborhood: 'east-side',         neighborhoodLabel: 'East Side' },
  { city: 'joliet', cityLabel: 'Joliet, IL', neighborhood: 'louis-rd-corridor', neighborhoodLabel: 'Louis Rd Corridor' },
  // ── NAPERVILLE ──
  { city: 'naperville', cityLabel: 'Naperville, IL', neighborhood: 'downtown-naperville', neighborhoodLabel: 'Downtown Naperville' },
  { city: 'naperville', cityLabel: 'Naperville, IL', neighborhood: 'south-naperville',    neighborhoodLabel: 'South Naperville' },
  { city: 'naperville', cityLabel: 'Naperville, IL', neighborhood: 'route-59',            neighborhoodLabel: 'Route 59' },
  // ── ELGIN ──
  { city: 'elgin', cityLabel: 'Elgin, IL', neighborhood: 'downtown-elgin', neighborhoodLabel: 'Downtown Elgin' },
  { city: 'elgin', cityLabel: 'Elgin, IL', neighborhood: 'mclean-blvd',    neighborhoodLabel: 'McLean Blvd' },
  { city: 'elgin', cityLabel: 'Elgin, IL', neighborhood: 'dundee-ave',     neighborhoodLabel: 'Dundee Ave' },
  // ── WAUKEGAN ──
  { city: 'waukegan', cityLabel: 'Waukegan, IL', neighborhood: 'downtown-waukegan', neighborhoodLabel: 'Downtown Waukegan' },
  { city: 'waukegan', cityLabel: 'Waukegan, IL', neighborhood: 'belvidere-rd',      neighborhoodLabel: 'Belvidere Rd' },
  { city: 'waukegan', cityLabel: 'Waukegan, IL', neighborhood: 'grand-ave',         neighborhoodLabel: 'Grand Ave' },
  // ── CICERO ──
  { city: 'cicero', cityLabel: 'Cicero, IL', neighborhood: 'cermak-road',  neighborhoodLabel: 'Cermak Road' },
  { city: 'cicero', cityLabel: 'Cicero, IL', neighborhood: '26th-street',  neighborhoodLabel: '26th Street' },
  { city: 'cicero', cityLabel: 'Cicero, IL', neighborhood: 'roosevelt-rd', neighborhoodLabel: 'Roosevelt Rd' },
  // ── BERWYN ──
  { city: 'berwyn', cityLabel: 'Berwyn, IL', neighborhood: 'cermak-road',    neighborhoodLabel: 'Cermak Road' },
  { city: 'berwyn', cityLabel: 'Berwyn, IL', neighborhood: 'roosevelt-rd',   neighborhoodLabel: 'Roosevelt Rd' },
  { city: 'berwyn', cityLabel: 'Berwyn, IL', neighborhood: 'depot-district', neighborhoodLabel: 'Depot District' },
  // ── ROCKFORD ──
  { city: 'rockford', cityLabel: 'Rockford, IL', neighborhood: 'downtown-rockford', neighborhoodLabel: 'Downtown Rockford' },
  { city: 'rockford', cityLabel: 'Rockford, IL', neighborhood: 'broadway',           neighborhoodLabel: 'Broadway' },
  { city: 'rockford', cityLabel: 'Rockford, IL', neighborhood: 'east-state-street',  neighborhoodLabel: 'East State Street' },
  // ── SPRINGFIELD ──
  { city: 'springfield', cityLabel: 'Springfield, IL', neighborhood: 'downtown',        neighborhoodLabel: 'Downtown' },
  { city: 'springfield', cityLabel: 'Springfield, IL', neighborhood: 'south-grand',     neighborhoodLabel: 'South Grand' },
  { city: 'springfield', cityLabel: 'Springfield, IL', neighborhood: 'dirksen-parkway', neighborhoodLabel: 'Dirksen Parkway' },
  // ── CHAMPAIGN ──
  { city: 'champaign', cityLabel: 'Champaign, IL', neighborhood: 'campustown',         neighborhoodLabel: 'Campustown' },
  { city: 'champaign', cityLabel: 'Champaign, IL', neighborhood: 'downtown-champaign', neighborhoodLabel: 'Downtown Champaign' },
  { city: 'champaign', cityLabel: 'Champaign, IL', neighborhood: 'green-street',       neighborhoodLabel: 'Green Street' },
  // ── EVANSTON ──
  { city: 'evanston', cityLabel: 'Evanston, IL', neighborhood: 'downtown-evanston', neighborhoodLabel: 'Downtown Evanston' },
  { city: 'evanston', cityLabel: 'Evanston, IL', neighborhood: 'central-street',    neighborhoodLabel: 'Central Street' },
  { city: 'evanston', cityLabel: 'Evanston, IL', neighborhood: 'dempster-street',   neighborhoodLabel: 'Dempster Street' },
  // ── SCHAUMBURG ──
  { city: 'schaumburg', cityLabel: 'Schaumburg, IL', neighborhood: 'woodfield-area', neighborhoodLabel: 'Woodfield Area' },
  { city: 'schaumburg', cityLabel: 'Schaumburg, IL', neighborhood: 'golf-road',      neighborhoodLabel: 'Golf Road' },
  { city: 'schaumburg', cityLabel: 'Schaumburg, IL', neighborhood: 'higgins-road',   neighborhoodLabel: 'Higgins Road' },
  // ── PEORIA ──
  { city: 'peoria', cityLabel: 'Peoria, IL', neighborhood: 'downtown-peoria', neighborhoodLabel: 'Downtown Peoria' },
  { city: 'peoria', cityLabel: 'Peoria, IL', neighborhood: 'junction-city',   neighborhoodLabel: 'Junction City' },
  // ── BLOOMINGTON IL ──
  { city: 'bloomington-il', cityLabel: 'Bloomington, IL', neighborhood: 'downtown-bloomington', neighborhoodLabel: 'Downtown Bloomington' },
  { city: 'bloomington-il', cityLabel: 'Bloomington, IL', neighborhood: 'veterans-pkwy',        neighborhoodLabel: 'Veterans Pkwy' },
  // ── DECATUR ──
  { city: 'decatur', cityLabel: 'Decatur, IL', neighborhood: 'downtown-decatur', neighborhoodLabel: 'Downtown Decatur' },
  { city: 'decatur', cityLabel: 'Decatur, IL', neighborhood: 'pershing-road',    neighborhoodLabel: 'Pershing Road' },
  // ── DEKALB ──
  { city: 'dekalb', cityLabel: 'DeKalb, IL', neighborhood: 'downtown-dekalb', neighborhoodLabel: 'Downtown DeKalb' },
  { city: 'dekalb', cityLabel: 'DeKalb, IL', neighborhood: 'lincoln-hwy',     neighborhoodLabel: 'Lincoln Hwy' },
  // ── GARY ──
  { city: 'gary', cityLabel: 'Gary, IN', neighborhood: 'downtown-gary', neighborhoodLabel: 'Downtown Gary' },
  { city: 'gary', cityLabel: 'Gary, IN', neighborhood: 'broadway',      neighborhoodLabel: 'Broadway' },
  { city: 'gary', cityLabel: 'Gary, IN', neighborhood: 'miller-beach',  neighborhoodLabel: 'Miller Beach' },
  // ── EAST CHICAGO ──
  { city: 'east-chicago', cityLabel: 'East Chicago, IN', neighborhood: 'indiana-harbor', neighborhoodLabel: 'Indiana Harbor' },
  { city: 'east-chicago', cityLabel: 'East Chicago, IN', neighborhood: 'main-street',    neighborhoodLabel: 'Main Street' },
  // ── HAMMOND ──
  { city: 'hammond', cityLabel: 'Hammond, IN', neighborhood: 'downtown-hammond', neighborhoodLabel: 'Downtown Hammond' },
  { city: 'hammond', cityLabel: 'Hammond, IN', neighborhood: 'calumet-ave',      neighborhoodLabel: 'Calumet Ave' },
  // ── INDIANAPOLIS ──
  { city: 'indianapolis', cityLabel: 'Indianapolis, IN', neighborhood: 'fountain-square',   neighborhoodLabel: 'Fountain Square' },
  { city: 'indianapolis', cityLabel: 'Indianapolis, IN', neighborhood: 'near-eastside',     neighborhoodLabel: 'Near Eastside' },
  { city: 'indianapolis', cityLabel: 'Indianapolis, IN', neighborhood: 'irvington',         neighborhoodLabel: 'Irvington' },
  { city: 'indianapolis', cityLabel: 'Indianapolis, IN', neighborhood: 'broad-ripple',      neighborhoodLabel: 'Broad Ripple' },
  { city: 'indianapolis', cityLabel: 'Indianapolis, IN', neighborhood: 'massachusetts-ave', neighborhoodLabel: 'Massachusetts Ave' },
  // ── FORT WAYNE ──
  { city: 'fort-wayne', cityLabel: 'Fort Wayne, IN', neighborhood: 'downtown-fort-wayne', neighborhoodLabel: 'Downtown Fort Wayne' },
  { city: 'fort-wayne', cityLabel: 'Fort Wayne, IN', neighborhood: 'south-side',          neighborhoodLabel: 'South Side' },
  { city: 'fort-wayne', cityLabel: 'Fort Wayne, IN', neighborhood: 'waynedale',           neighborhoodLabel: 'Waynedale' },
  // ── SOUTH BEND ──
  { city: 'south-bend', cityLabel: 'South Bend, IN', neighborhood: 'downtown-south-bend', neighborhoodLabel: 'Downtown South Bend' },
  { city: 'south-bend', cityLabel: 'South Bend, IN', neighborhood: 'near-southwest',      neighborhoodLabel: 'Near Southwest' },
  { city: 'south-bend', cityLabel: 'South Bend, IN', neighborhood: 'west-side',           neighborhoodLabel: 'West Side' },
  // ── VALPARAISO ──
  { city: 'valparaiso', cityLabel: 'Valparaiso, IN', neighborhood: 'downtown-valparaiso', neighborhoodLabel: 'Downtown Valparaiso' },
  { city: 'valparaiso', cityLabel: 'Valparaiso, IN', neighborhood: 'lincolnway',          neighborhoodLabel: 'Lincolnway' },
  // ── EVANSVILLE ──
  { city: 'evansville', cityLabel: 'Evansville, IN', neighborhood: 'downtown-evansville', neighborhoodLabel: 'Downtown Evansville' },
  { city: 'evansville', cityLabel: 'Evansville, IN', neighborhood: 'haynie-corner',       neighborhoodLabel: 'Haynie Corner' },
  // ── BLOOMINGTON IN ──
  { city: 'bloomington-in', cityLabel: 'Bloomington, IN', neighborhood: 'downtown-bloomington', neighborhoodLabel: 'Downtown Bloomington' },
  { city: 'bloomington-in', cityLabel: 'Bloomington, IN', neighborhood: 'kirkwood-ave',         neighborhoodLabel: 'Kirkwood Ave' },
  // ── TERRE HAUTE ──
  { city: 'terre-haute', cityLabel: 'Terre Haute, IN', neighborhood: 'downtown-terre-haute', neighborhoodLabel: 'Downtown Terre Haute' },
  { city: 'terre-haute', cityLabel: 'Terre Haute, IN', neighborhood: 'wabash-ave',           neighborhoodLabel: 'Wabash Ave' },
  // ── LAFAYETTE ──
  { city: 'lafayette', cityLabel: 'Lafayette, IN', neighborhood: 'downtown-lafayette', neighborhoodLabel: 'Downtown Lafayette' },
  { city: 'lafayette', cityLabel: 'Lafayette, IN', neighborhood: 'south-street',       neighborhoodLabel: 'South Street' },
  // ── MUNCIE ──
  { city: 'muncie', cityLabel: 'Muncie, IN', neighborhood: 'downtown-muncie', neighborhoodLabel: 'Downtown Muncie' },
  { city: 'muncie', cityLabel: 'Muncie, IN', neighborhood: 'mcgalliard-rd',   neighborhoodLabel: 'McGalliard Rd' },
  // ── MICHIGAN CITY ──
  { city: 'michigan-city', cityLabel: 'Michigan City, IN', neighborhood: 'downtown',      neighborhoodLabel: 'Downtown' },
  { city: 'michigan-city', cityLabel: 'Michigan City, IN', neighborhood: 'dunes-highway', neighborhoodLabel: 'Dunes Highway' },
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const secret = req.headers['x-api-secret'];
  if (secret !== process.env.NOTIFY_API_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const startAt = parseInt(req.query.startAt || '0', 10);
  const BATCH = 8;
  const endAt = Math.min(startAt + BATCH, ALL_PAIRS.length);
  const batch = ALL_PAIRS.slice(startAt, endAt);

  const results = [];
  for (const pair of batch) {
    try {
      const r = await scoutNeighborhood(pair.city, pair.cityLabel, pair.neighborhood, pair.neighborhoodLabel, db);
      results.push({ ...pair, ...r, status: 'ok' });
    } catch (err) {
      results.push({ ...pair, status: 'error', error: err.message });
    }
    await delay(300);
  }

  const done = endAt >= ALL_PAIRS.length;
  return res.status(200).json({
    success: true,
    processed: batch.length,
    total: ALL_PAIRS.length,
    startAt,
    endAt,
    nextStartAt: done ? null : endAt,
    done,
    results,
  });
}
