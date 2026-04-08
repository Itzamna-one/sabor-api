import { checkRateLimit, getClientIp } from '../lib/sabor-security.js';

// Valid Google Places photo reference: places/{placeId}/photos/{photoRef}
const PHOTO_REF_RE = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export default async function handler(req, res) {
  const { ref } = req.query;
  if (!ref) return res.status(400).json({ error: 'ref required' });

  // Validate ref format to prevent URL injection into Google Places API path
  if (!PHOTO_REF_RE.test(ref)) {
    return res.status(400).json({ error: 'Invalid photo reference format' });
  }

  // Rate limit: 30 photo fetches per IP per minute
  const clientIp = getClientIp(req);
  const rl = checkRateLimit(clientIp, 'photo', 30, 60_000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too many requests', retryAfter: rl.retryAfter });
  }

  const key = process.env.GOOGLE_PLACES_KEY;
  if (!key) return res.status(500).json({ error: 'GOOGLE_PLACES_KEY not set' });
  try {
    const url = `https://places.googleapis.com/v1/${ref}/media?maxHeightPx=600&maxWidthPx=800&key=${key}&skipHttpRedirect=true`;
    const r = await fetch(url);
    const data = await r.json();
    if (!data.photoUri) return res.status(404).json({ error: 'No photo URI' });
    const imgResp = await fetch(data.photoUri);
    const buffer = await imgResp.arrayBuffer();
    res.setHeader('Content-Type', imgResp.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(Buffer.from(buffer));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
