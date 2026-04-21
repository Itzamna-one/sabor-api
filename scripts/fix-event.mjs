import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

await db.collection('sabor_events').doc('cafecito-conchas-sater-tasa-20260420').update({
  date: 'Saturday, April 19',
  expiresAt: new Date('2026-04-20T00:00:00Z').toISOString(),
});

console.log('✅ Fixed: Cafecito con Conchas @ Sater Tasa → Saturday April 19');
process.exit(0);
