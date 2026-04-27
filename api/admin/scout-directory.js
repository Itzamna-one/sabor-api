// api/admin/scout-directory.js
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { scoutNeighborhood } from './scout-core.js';

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

const CITY_LABELS = {
  'chicago': 'Chicago, IL', 'aurora': 'Aurora, IL', 'joliet': 'Joliet, IL',
  'naperville': 'Naperville, IL', 'elgin': 'Elgin, IL', 'waukegan': 'Waukegan, IL',
  'cicero': 'Cicero, IL', 'berwyn': 'Berwyn, IL', 'rockford': 'Rockford, IL',
  'springfield': 'Springfield, IL', 'champaign': 'Champaign, IL', 'evanston': 'Evanston, IL',
  'schaumburg': 'Schaumburg, IL', 'peoria': 'Peoria, IL', 'bloomington-il': 'Bloomington, IL',
  'decatur': 'Decatur, IL', 'dekalb': 'DeKalb, IL', 'gary': 'Gary, IN',
  'east-chicago': 'East Chicago, IN', 'hammond': 'Hammond, IN', 'indianapolis': 'Indianapolis, IN',
  'fort-wayne': 'Fort Wayne, IN', 'south-bend': 'South Bend, IN', 'valparaiso': 'Valparaiso, IN',
  'evansville': 'Evansville, IN', 'bloomington-in': 'Bloomington, IN',
  'terre-haute': 'Terre Haute, IN', 'lafayette': 'Lafayette, IN',
  'muncie': 'Muncie, IN', 'michigan-city': 'Michigan City, IN',
};

function fromSlug(s) {
  return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Secret, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.headers['x-api-secret'];
  const cronAuth = req.headers['authorization'];
  const isAdmin = secret === process.env.NOTIFY_API_SECRET;
  const isCron = cronAuth === `Bearer ${process.env.CRON_SECRET}`;
  if (!isAdmin && !isCron) return res.status(401).json({ error: 'Unauthorized' });

  const { city: citySlug, neighborhood: neighborhoodSlug } = req.query;
  if (!citySlug || !neighborhoodSlug) {
    return res.status(400).json({ error: 'city and neighborhood query params required' });
  }

  const cityLabel = CITY_LABELS[citySlug];
  if (!cityLabel) return res.status(400).json({ error: `Unknown city: ${citySlug}` });

  const neighborhoodLabel = fromSlug(neighborhoodSlug);

  try {
    const result = await scoutNeighborhood(citySlug, cityLabel, neighborhoodSlug, neighborhoodLabel, db);
    return res.status(200).json({ success: true, city: citySlug, neighborhood: neighborhoodSlug, ...result });
  } catch (err) {
    console.error('Scout error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
