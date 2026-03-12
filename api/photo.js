export default async function handler(req, res) {
  const { ref } = req.query;
  if (!ref) return res.status(400).json({ error: 'ref required' });
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
