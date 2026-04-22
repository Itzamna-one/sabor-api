import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin (uses FIREBASE_SERVICE_ACCOUNT env var)
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();
const messaging = getMessaging();

/**
 * POST /api/notify
 *
 * Send push notifications to premium users.
 * Protected by API_SECRET header to prevent unauthorized access.
 *
 * Body: {
 *   type: 'event' | 'weekly_picks' | 'custom',
 *   title: string,
 *   body: string,
 *   data?: { [key: string]: string },   // optional deep-link data
 *   topic?: string,                      // send to topic instead of all tokens
 * }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth check — must include secret header
  const secret = req.headers['x-api-secret'];
  const expected = process.env.NOTIFY_API_SECRET;
  if (!expected || secret !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { type, title, body, data = {}, topic, city, language } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: 'title and body are required' });
  }

  const notification = { title, body };
  const payload = { ...data, type: type || 'general' };

  try {
    let result;

    if (topic) {
      // Send to a topic (e.g. 'premium_events', 'weekly_picks')
      result = await messaging.send({
        topic,
        notification,
        data: payload,
        apns: {
          payload: {
            aps: { sound: 'default', badge: 1 },
          },
        },
      });
      return res.status(200).json({ success: true, method: 'topic', topic, messageId: result });
    }

    // Send to all tokens, optionally filtered by city and/or language
    let query = db.collection('fcm_tokens');
    if (city) query = query.where('city', '==', city.toLowerCase());
    if (language) query = query.where('language', '==', language.toLowerCase());
    const snapshot = await query.get();
    if (snapshot.empty) {
      return res.status(200).json({ success: true, sent: 0, message: 'No tokens registered' });
    }

    const tokens = snapshot.docs.map(doc => doc.data().token).filter(Boolean);
    if (tokens.length === 0) {
      return res.status(200).json({ success: true, sent: 0, message: 'No valid tokens' });
    }

    // Send to up to 500 tokens at once (FCM limit)
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification,
      data: payload,
      apns: {
        payload: {
          aps: { sound: 'default', badge: 1 },
        },
      },
    });

    // Clean up invalid tokens
    const failedTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
        failedTokens.push(tokens[idx]);
      }
    });

    if (failedTokens.length > 0) {
      // Firestore 'in' query limit is 10 — process in chunks
      const batch = db.batch();
      for (let i = 0; i < failedTokens.length; i += 10) {
        const chunk = failedTokens.slice(i, i + 10);
        const tokenDocs = await db.collection('fcm_tokens')
          .where('token', 'in', chunk)
          .get();
        tokenDocs.forEach(doc => batch.delete(doc.ref));
      }
      await batch.commit();
    }

    return res.status(200).json({
      success: true,
      sent: response.successCount,
      failed: response.failureCount,
      cleaned: failedTokens.length,
    });
  } catch (err) {
    console.error('Notify error:', err.message);
    return res.status(500).json({ error: 'Push failed', message: err.message });
  }
}
