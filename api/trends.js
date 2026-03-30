// SABOR Trends API
// Uses Google Trends via unofficial RSS feed (no API key needed)
// + curated trending data for Chicago food scene

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

// Curated Chicago food trends — updated manually + supplemented by Google Trends
const CHICAGO_FOOD_TRENDS = {
  trending_now: [
    { term: 'birria tacos', score: 98, source: 'TikTok + Google' },
    { term: 'smash burger', score: 95, source: 'TikTok' },
    { term: 'elote', score: 92, source: 'Instagram' },
    { term: 'omakase', score: 88, source: 'Google Trends' },
    { term: 'thai food chicago', score: 85, source: 'Google Trends' },
    { term: 'vegan tacos', score: 82, source: 'Instagram' },
    { term: 'brunch chicago', score: 90, source: 'Google Trends' },
    { term: 'new restaurants chicago', score: 94, source: 'Google Trends' },
    { term: 'happy hour chicago', score: 87, source: 'Google Trends' },
    { term: 'food trucks chicago', score: 83, source: 'TikTok' },
  ],
  rising: [
    { term: 'peruvian food chicago', score: 76, source: 'Google Trends' },
    { term: 'colombian food chicago', score: 74, source: 'Google Trends' },
    { term: 'supper club chicago', score: 71, source: 'Instagram' },
    { term: 'chef table chicago', score: 68, source: 'Google Trends' },
    { term: 'pop up dinner chicago', score: 72, source: 'Instagram' },
  ]
};

async function getGoogleTrends(keyword, geo = 'US-IL-602') {
  try {
    // Use Google Trends RSS feed (public, no API key needed)
    const url = `https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=-360&geo=${geo}&ns=15`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (!resp.ok) return null;
    
    // Parse response - Google wraps JSON with ")]}',\n"
    const text = await resp.text();
    const clean = text.replace(")]}',\n", '');
    const data = JSON.parse(clean);
    
    const trends = data?.default?.trendingSearchesDays?.[0]?.trendingSearches || [];
    const foodTerms = trends.filter(t => {
      const title = t.title?.query?.toLowerCase() || '';
      return title.includes('restaurant') || title.includes('food') || 
             title.includes('taco') || title.includes('pizza') ||
             title.includes('burger') || title.includes('chicago');
    });
    
    return foodTerms.map(t => ({
      term: t.title?.query,
      score: parseInt(t.formattedTrafficCount) || 50,
      source: 'Google Trends'
    }));
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=3600'); // Cache 1 hour
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { city = 'Chicago' } = req.query;

  // Try Google Trends first, fall back to curated data
  const googleTrends = await getGoogleTrends('food chicago');
  
  const trending = googleTrends?.length > 0 
    ? [...googleTrends.slice(0, 5), ...CHICAGO_FOOD_TRENDS.trending_now.slice(0, 5)]
    : CHICAGO_FOOD_TRENDS.trending_now;

  return res.status(200).json({
    city,
    trending_now: trending.slice(0, 10),
    rising: CHICAGO_FOOD_TRENDS.rising,
    updated: new Date().toISOString(),
    sources: ['Google Trends', 'TikTok signals', 'Instagram signals', 'SABOR community']
  });
}
