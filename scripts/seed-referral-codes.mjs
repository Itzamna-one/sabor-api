// scripts/seed-referral-codes.mjs
// Run once to seed influencer referral codes into Firestore.
// Usage: node scripts/seed-referral-codes.mjs  (reads .env.local via dotenv)

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '{}').replace(/\n/g, '\\n');
  const serviceAccount = JSON.parse(raw);
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

const CODES = [
  { code: 'ANAYELY',  influencer: 'Anayely',  type: 'influencer' },
  { code: 'MARIE',    influencer: 'Marie',     type: 'influencer' },
  { code: 'FOMO',     influencer: 'TBD',       type: 'influencer' },
  { code: 'CRITIC1',  influencer: 'TBD',       type: 'food_critic' },
  { code: 'CRITIC2',  influencer: 'TBD',       type: 'food_critic' },
];

async function seed() {
  for (const entry of CODES) {
    const ref = db.collection('referral_codes').doc(entry.code);
    const existing = await ref.get();
    if (existing.exists) {
      console.log(`  skip  ${entry.code} — already exists`);
      continue;
    }
    await ref.set({
      code: entry.code,
      influencer: entry.influencer,
      type: entry.type,
      signups: 0,
      paidConversions: 0,
      createdAt: FieldValue.serverTimestamp(),
    });
    console.log(`  seeded ${entry.code} (${entry.influencer})`);
  }
  console.log('\nDone. Update TBD entries via Firebase console or re-run after editing this file.');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
