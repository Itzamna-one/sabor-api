import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

const INCREMENT_TYPES = new Set(['INITIAL_PURCHASE', 'RENEWAL']);
const DECREMENT_TYPES = new Set(['CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE']);

function monthStamp() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token || token !== process.env.REVENUECAT_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const event = req.body?.event;
  if (!event?.type || !event?.app_user_id) {
    return res.status(400).json({ error: 'Missing event.type or event.app_user_id' });
  }

  const { type, app_user_id: uid, id: rcEventId } = event;

  if (!INCREMENT_TYPES.has(type) && !DECREMENT_TYPES.has(type)) {
    return res.status(200).json({ ok: true, skipped: 'unhandled event type' });
  }

  try {
    const profileDoc = await db.collection('user_profiles').doc(uid).get();
    if (!profileDoc.exists) return res.status(200).json({ ok: true, skipped: 'no user profile' });

    const { referralCode } = profileDoc.data();
    if (!referralCode) return res.status(200).json({ ok: true, skipped: 'no referral code' });

    const codeRef = db.collection('referral_codes').doc(referralCode);
    const delta = INCREMENT_TYPES.has(type) ? 1 : -1;

    // Use RC event ID as doc ID — makes the entire webhook idempotent.
    // Fallback to uid+type+timestamp if RC doesn't provide an id yet.
    const eventDocId = rcEventId || `${uid}_${type}_${Date.now()}`;
    const eventDocRef = db.collection('referral_events').doc(eventDocId);

    await db.runTransaction(async (tx) => {
      // Idempotency check — if this event was already processed, bail out
      const eventSnap = await tx.get(eventDocRef);
      if (eventSnap.exists) return; // already processed, no-op

      const codeSnap = await tx.get(codeRef);
      const before = codeSnap.exists ? (codeSnap.data().activeSubCount || 0) : 0;
      const after = Math.max(0, before + delta);

      tx.update(codeRef, { activeSubCount: after });

      tx.set(eventDocRef, {
        eventId: eventDocId,
        rcEventId: rcEventId || null,
        type,
        uid,
        referralCode,
        delta,
        activeSubCountBefore: before,
        activeSubCountAfter: after,
        month: monthStamp(),
        timestamp: FieldValue.serverTimestamp(),
      });
    });

    return res.status(200).json({ ok: true, type, referralCode, delta });
  } catch (e) {
    console.error('[revenuecat webhook] error:', e);
    return res.status(500).json({ error: e.message });
  }
}
