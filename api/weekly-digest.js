// api/weekly-digest.js — Weekly pioneer activity digest sent via FCM push notifications.
//
// Runs on a Vercel cron schedule (GET /api/weekly-digest). Queries the `spot_discoveries`
// collection for spots that received saves in the past 7 days, groups results by pioneer,
// and sends each active pioneer a personalized push summarising their week.
//
// Auth: accepts requests from Vercel cron (x-vercel-cron header) OR app key (X-Sabor-Key).

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirestore } from 'firebase-admin/firestore';
import { checkAppKey } from '../lib/sabor-security.js';

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();
const messaging = getMessaging();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sabor-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Allow Vercel cron invocations (x-vercel-cron header) or valid app key
  const isVercelCron = !!req.headers['x-vercel-cron'];
  if (!isVercelCron && !checkAppKey(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── 1. Fetch spots saved in the last 7 days ──────────────────────────────
    const { Timestamp } = await import('firebase-admin/firestore');
    const sevenDaysAgo = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

    const snapshot = await db
      .collection('spot_discoveries')
      .where('lastSaveAt', '>=', sevenDaysAgo)
      .limit(200)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({ success: true, pioneersNotified: 0, totalSaves: 0, errors: [] });
    }

    // ── 2. Group by pioneerId ────────────────────────────────────────────────
    const pioneerMap = new Map(); // pioneerUid → { totalSaves, topSpot, spotCount }

    snapshot.forEach(doc => {
      const { pioneerId, spotName, saveCount = 0 } = doc.data();
      if (!pioneerId || !spotName) return;

      const existing = pioneerMap.get(pioneerId);
      if (!existing) {
        pioneerMap.set(pioneerId, {
          totalSaves: saveCount,
          topSpot: { spotName, saveCount },
          spotCount: 1,
        });
      } else {
        existing.totalSaves += saveCount;
        existing.spotCount += 1;
        if (saveCount > existing.topSpot.saveCount) {
          existing.topSpot = { spotName, saveCount };
        }
      }
    });

    if (pioneerMap.size === 0) {
      return res.status(200).json({ success: true, pioneersNotified: 0, totalSaves: 0, errors: [] });
    }

    // ── 3. Batch-fetch FCM tokens in parallel ────────────────────────────────
    const pioneerIds = [...pioneerMap.keys()];
    const tokenDocs = await Promise.all(
      pioneerIds.map(uid => db.collection('fcm_tokens').doc(uid).get())
    );

    // Build uid → token lookup; skip pioneers with no valid token
    const tokenMap = new Map();
    tokenDocs.forEach((doc, idx) => {
      if (doc.exists) {
        const token = doc.data()?.token;
        if (token) tokenMap.set(pioneerIds[idx], token);
      }
    });

    // ── 4. Send FCM messages in parallel ────────────────────────────────────
    const sendResults = await Promise.all(
      pioneerIds
        .filter(uid => tokenMap.has(uid))
        .map(async uid => {
          const { totalSaves, topSpot, spotCount } = pioneerMap.get(uid);
          const token = tokenMap.get(uid);

          const title = `🌶️ Your spots got ${totalSaves} save${totalSaves > 1 ? 's' : ''} this week!`;
          const body =
            spotCount > 1
              ? `${topSpot.spotName} leads with ${topSpot.saveCount} saves`
              : `${topSpot.spotName} is your hottest pick`;

          try {
            await messaging.send({
              token,
              notification: { title, body },
              data: {
                type: 'pioneer_save',
                spotName: topSpot.spotName,
              },
              apns: {
                payload: {
                  aps: { sound: 'default', badge: 1 },
                },
              },
            });
            return { uid, success: true };
          } catch (err) {
            if (err.code === 'messaging/registration-token-not-registered') {
              return { uid, success: false, expiredToken: true };
            }
            console.error(`weekly-digest: send failed for ${uid}:`, err.message);
            return { uid, success: false, error: err.message };
          }
        })
    );

    // ── 5. Clean up expired tokens in a single Firestore batch ──────────────
    const expiredUids = sendResults.filter(r => r.expiredToken).map(r => r.uid);
    if (expiredUids.length > 0) {
      const batch = db.batch();
      expiredUids.forEach(uid => {
        batch.delete(db.collection('fcm_tokens').doc(uid));
      });
      await batch.commit().catch(err =>
        console.error('weekly-digest: token cleanup failed:', err.message)
      );
    }

    // ── 6. Build summary ─────────────────────────────────────────────────────
    const pioneersNotified = sendResults.filter(r => r.success).length;
    const grandTotalSaves = [...pioneerMap.values()].reduce((sum, p) => sum + p.totalSaves, 0);
    const errors = sendResults
      .filter(r => !r.success && !r.expiredToken)
      .map(r => ({ uid: r.uid, error: r.error }));

    return res.status(200).json({
      success: true,
      pioneersNotified,
      totalSaves: grandTotalSaves,
      errors,
    });
  } catch (err) {
    console.error('weekly-digest: fatal error:', err.message);
    return res.status(500).json({ error: 'Weekly digest failed', message: err.message });
  }
}
