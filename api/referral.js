// api/referral.js
// Referral code system for influencer campaign tracking.
//
// POST /api/referral  { action: 'apply', uid, code }     — X-Sabor-Key — called on signup
// POST /api/referral  { action: 'conversion', uid }      — X-Sabor-Key — called on first paid sub
// GET  /api/referral                                      — X-API-Secret — admin stats

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

function isAppKeyValid(req) {
  const key = req.headers['x-sabor-key'];
  const expected = process.env.SABOR_APP_KEY;
  return expected && key === expected;
}

function isAdminValid(req) {
  const secret = req.headers['x-api-secret'];
  const expected = process.env.NOTIFY_API_SECRET;
  return expected && secret === expected;
}

async function applyCode(uid, rawCode) {
  if (!uid || !rawCode) return { error: 'uid and code are required', status: 400 };

  const code = rawCode.trim().toUpperCase();
  const codeRef = db.collection('referral_codes').doc(code);
  const codeDoc = await codeRef.get();

  if (!codeDoc.exists) return { error: 'Invalid referral code', status: 400 };

  // Write referral code to user profile (merge — non-destructive)
  await db.collection('user_profiles').doc(uid).set(
    { referralCode: code, referralAppliedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  // Increment signup count on the code doc
  await codeRef.update({ signups: FieldValue.increment(1) });

  return { ok: true, influencer: codeDoc.data().influencer };
}

async function trackConversion(uid) {
  if (!uid) return { error: 'uid is required', status: 400 };

  const profileRef = db.collection('user_profiles').doc(uid);
  const profileDoc = await profileRef.get();

  if (!profileDoc.exists) return { error: 'User profile not found', status: 404 };

  const { referralCode, referralConversionTracked } = profileDoc.data();

  if (!referralCode) return { ok: true, skipped: 'no referral code on this user' };
  if (referralConversionTracked) return { ok: true, skipped: 'conversion already tracked' };

  await db.collection('referral_codes').doc(referralCode).update({
    paidConversions: FieldValue.increment(1),
  });

  // Mark so we never double-count
  await profileRef.update({ referralConversionTracked: true });

  return { ok: true, code: referralCode };
}

async function getStats() {
  const snap = await db.collection('referral_codes').get();
  const codes = snap.docs.map(d => d.data()).sort((a, b) =>
    (b.paidConversions || 0) - (a.paidConversions || 0)
  );
  const totals = codes.reduce(
    (acc, c) => ({
      signups:              acc.signups              + (c.signups              || 0),
      paid:                 acc.paid                 + (c.paidConversions      || 0),
      ownerSignups:         acc.ownerSignups         + (c.ownerSignups         || 0),
      ownerCommissionTotal: acc.ownerCommissionTotal + (c.ownerCommissionTotal || 0),
    }),
    { signups: 0, paid: 0, ownerSignups: 0, ownerCommissionTotal: 0 }
  );
  return { codes, totals };
}

const SEED_CODES = [
  { code: 'ANAYELY', influencer: 'Anayely', type: 'influencer' },
  { code: 'MARIE',   influencer: 'Marie',   type: 'influencer' },
  { code: 'FOMO',    influencer: 'TBD',     type: 'influencer' },
  { code: 'CRITIC1', influencer: 'TBD',     type: 'food_critic' },
  { code: 'CRITIC2', influencer: 'TBD',     type: 'food_critic' },
];

async function seedCodes() {
  const results = [];
  for (const entry of SEED_CODES) {
    const ref = db.collection('referral_codes').doc(entry.code);
    const existing = await ref.get();
    if (existing.exists) {
      results.push({ code: entry.code, status: 'skipped' });
      continue;
    }
    await ref.set({ ...entry, signups: 0, paidConversions: 0, createdAt: new Date().toISOString() });
    results.push({ code: entry.code, status: 'seeded' });
  }
  return results;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET — admin stats or seed ──────────────────────────────────────────────
  if (req.method === 'GET') {
    if (!isAdminValid(req)) return res.status(401).json({ error: 'Unauthorized' });
    try {
      if (req.query.action === 'seed') {
        const results = await seedCodes();
        return res.status(200).json({ seeded: results });
      }
      const stats = await getStats();
      return res.status(200).json(stats);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST — apply / conversion ──────────────────────────────────────────────
  if (req.method === 'POST') {
    if (!isAppKeyValid(req)) return res.status(401).json({ error: 'Unauthorized' });

    const { action, uid, code } = req.body || {};

    try {
      if (action === 'apply') {
        const result = await applyCode(uid, code);
        if (result.error) return res.status(result.status).json({ error: result.error });
        return res.status(200).json(result);
      }

      if (action === 'conversion') {
        const result = await trackConversion(uid);
        if (result.error) return res.status(result.status).json({ error: result.error });
        return res.status(200).json(result);
      }

      return res.status(400).json({ error: 'action must be "apply" or "conversion"' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
