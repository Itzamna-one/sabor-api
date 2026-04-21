// One-time script to add curated events to Firestore sabor_events collection
// Usage: node scripts/add-events.mjs
// Requires: FIREBASE_SERVICE_ACCOUNT env var

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Sunday April 20, 2026 — next occurrence
const events = [
  {
    id: 'cafecito-conchas-sater-tasa-20260420',
    title: 'Cafecito con Conchas',
    description: 'Sunday morning cafecito and fresh conchas at Sater Tasa Coffee Roasters. Grab your coffee and pan dulce and enjoy the community vibes.',
    venue: 'Sater Tasa Coffee Roasters',
    address: '4136 W North Ave',
    neighborhood: 'Humboldt Park',
    city: 'Chicago, IL',
    date: 'Sunday, April 20',
    time: '9:00 AM - 1:00 PM',
    price: 'Free',
    priceNum: 0,
    category: 'special',
    vibe: 'Food Event',
    emoji: '☕',
    tags: ['cafecito', 'conchas', 'pan dulce', 'coffee', 'community', 'sunday'],
    source: 'SABOR',
    url: null,
    image: null,
    recurring: true,
    expiresAt: new Date('2026-04-21T00:00:00Z').toISOString(),
  },
  {
    id: 'cafecito-conchas-las-casas-20260420',
    title: 'Cafecito con Conchas',
    description: 'Sunday cafecito con conchas at Las Casas Playroom. Familia-friendly morning gathering with coffee and pan dulce in the Archer Heights community.',
    venue: 'Las Casas Playroom',
    address: '4371 S Archer Ave',
    neighborhood: 'Archer Heights',
    city: 'Chicago, IL',
    date: 'Sunday, April 20',
    time: '10:00 AM - 3:00 PM',
    price: 'Free',
    priceNum: 0,
    category: 'special',
    vibe: 'Food Event',
    emoji: '☕',
    tags: ['cafecito', 'conchas', 'pan dulce', 'coffee', 'community', 'sunday', 'familia'],
    source: 'SABOR',
    url: null,
    image: null,
    recurring: true,
    expiresAt: new Date('2026-04-21T00:00:00Z').toISOString(),
  },
  {
    id: 'cafecito-latin-brunch-vista-rooftop-20260420',
    title: 'Cafecito Latin Brunch',
    description: 'Latin brunch on the rooftop at Vista. Cafecito, food, and views — Sunday done right on MLK Drive.',
    venue: 'Vista Roof Top',
    address: '1023 N MLK Drive',
    neighborhood: 'Humboldt Park',
    city: 'Chicago, IL',
    date: 'Sunday, April 20',
    time: '11:00 AM - 4:00 PM',
    price: 'See venue',
    priceNum: 0,
    category: 'brunch',
    vibe: 'Brunch',
    emoji: '🍳',
    tags: ['cafecito', 'brunch', 'latin brunch', 'rooftop', 'sunday', 'community'],
    source: 'SABOR',
    url: null,
    image: null,
    recurring: false,
    expiresAt: new Date('2026-04-21T00:00:00Z').toISOString(),
  },
];

for (const event of events) {
  await db.collection('sabor_events').doc(event.id).set(event);
  console.log(`✅ Added: ${event.title} @ ${event.venue}`);
}

console.log('Done.');
process.exit(0);
