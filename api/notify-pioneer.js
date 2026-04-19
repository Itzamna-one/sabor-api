// api/notify-pioneer.js — Push notification when someone saves a pioneered spot
// Called by Flutter client after a successful spot save (authenticated via SABOR_APP_KEY).
// Sends a targeted FCM notification to the pioneer only — no broadcast.

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

/**
 * POST /api/notify-pioneer
 *
 * Sends a push notification to a pioneer when someone saves their spot.
 * Also fires milestone bursts at 5 / 10 / 25 / 50 / 100 saves.
 *
 * Body: {
 *   pioneerUid:      string  — UID of the pioneer to notify
 *   spotName:        string  — display name of the restaurant
 *   savedByUsername: string  — @username of the person who saved (may be empty)
 *   saveCount:       number  — current total saves on this spot
 *   isMilestone:     boolean — true if this save hits a milestone threshold
 * }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sabor-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAppKey(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pioneerUid, spotName, savedByUsername, saveCount = 1, isMilestone = false } = req.body;

  if (!pioneerUid || !spotName) {
    return res.status(400).json({ error: 'pioneerUid and spotName are required' });
  }

  // Look up pioneer's FCM token (doc ID = UID)
  let token;
  try {
    const tokenDoc = await db.collection('fcm_tokens').doc(pioneerUid).get();
    if (!tokenDoc.exists) {
      return res.status(200).json({ success: true, skipped: 'no_token' });
    }
    token = tokenDoc.data()?.token;
    if (!token) {
      return res.status(200).json({ success: true, skipped: 'empty_token' });
    }
  } catch (err) {
    console.error('notify-pioneer: token lookup failed:', err.message);
    return res.status(500).json({ error: 'Token lookup failed' });
  }

  // Build notification message
  let title, body;
  if (isMilestone) {
    const milestone = [100, 50, 25, 10, 5].find(m => saveCount >= m) ?? saveCount;
    title = `🌶️ ${milestone} people saved your spot!`;
    body = `${spotName} is blowing up. You found it first.`;
  } else if (savedByUsername) {
    title = `@${savedByUsername} saved your spot 🌶️`;
    body = spotName;
  } else {
    title = `Someone saved your spot 🌶️`;
    body = spotName;
  }

  try {
    const result = await messaging.send({
      token,
      notification: { title, body },
      data: {
        type: 'pioneer_save',
        spotName,
        saveCount: String(saveCount),
      },
      apns: {
        payload: {
          aps: { sound: 'default', badge: 1 },
        },
      },
    });

    return res.status(200).json({ success: true, messageId: result });
  } catch (err) {
    // Token expired / unregistered — clean it up
    if (err.code === 'messaging/registration-token-not-registered') {
      await db.collection('fcm_tokens').doc(pioneerUid).delete().catch(() => {});
      return res.status(200).json({ success: true, skipped: 'token_expired' });
    }
    console.error('notify-pioneer: send failed:', err.message);
    return res.status(500).json({ error: 'Push failed', message: err.message });
  }
}
