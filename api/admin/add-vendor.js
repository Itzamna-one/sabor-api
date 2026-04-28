// api/admin/add-vendor.js
// Quick-add street vendors, food trucks, eloteros, tamale vendors.
// POST with X-API-Secret header.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { toSlug } from './scout-core.js';

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

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

  const {
    name,
    city,         // slug e.g. 'chicago'
    cityLabel,    // e.g. 'Chicago, IL'
    neighborhood, // slug e.g. 'pilsen'
    neighborhoodLabel,
    spotType = 'street_vendor', // 'restaurant' | 'truck' | 'street_vendor'
    cuisine = 'Street Food',
    movingLocation = '',  // "Usually at 26th & Kostner, weekends 5-10pm"
    description = '',
    socialHandle = '',    // TikTok/Instagram @handle
    phone = '',
    address = '',
  } = req.body || {};

  if (!name || !city || !neighborhood) {
    return res.status(400).json({ error: 'name, city, neighborhood required' });
  }

  const slug = toSlug(name);
  if (!slug) return res.status(400).json({ error: 'Could not generate slug from name' });

  const docId = `${city}_${neighborhood}_${slug}`;
  const now = new Date().toISOString();

  const tags = [cuisine.toLowerCase(), 'street food'];
  if (spotType === 'truck') tags.push('food truck');
  if (spotType === 'street_vendor') tags.push('street vendor');

  const doc = {
    slug,
    restaurantName: name,
    city,
    cityLabel: cityLabel || city,
    neighborhood,
    neighborhoodLabel: neighborhoodLabel || neighborhood,
    spotType,
    cuisine,
    description,
    movingLocation,
    socialHandle,
    phone,
    address,
    lat: 0,
    lng: 0,
    photoUrl: null,
    rating: 0,
    reviewCount: 0,
    priceLevel: 1,
    tags,
    source: 'manual',
    tier: 'free',
    savesCount: 0,
    ownerId: null,
    currentSpecial: null,
    scoutedAt: now,
    updatedAt: now,
  };

  await db.collection('directory_spots').doc(docId).set(doc, { merge: false });

  return res.status(200).json({ success: true, docId, slug });
}
