// api/photo.js
// GET /api/photo?ref=<places_photo_name>
// Proxies Google Places photo to avoid CORS/redirect issues on web
export default async function handler(req, res) {
  const { ref } = req.query;
  if (!ref) return res.status(400).json({ error: 'ref required' });
  const key = process.env.GOOGLE_PLACES_KEY;
  if (!key) return res.status(500).json({ error: 'GOOGLE_PLACES_KEY not set' });
  try {
    const url = `https://places.googleapis.com/v1/${ref}/media?maxHeightPx=600&maxWidthPx=800&key=${key}&skipHttpRedirect=true`;
    const r = await fetch(url);
    const data = await r.json();
    const photoUri = data.photoUri;
    if (!photoUri) return res.status(404).json({ error: 'No photo URI' });
    // Fetch the actual image and stream it back
    const imgResp = await fetch(photoUri);
    const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
    const buffer = await imgResp.arrayBuffer();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(Buffer.from(buffer));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
