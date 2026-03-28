// api/neighborhoods.js — Neighborhood data per city/metro (hardcoded for speed)
// No AI call needed — neighborhoods don't change. Add new cities as we expand.

const CITY_NEIGHBORHOODS = {
  // ═══════════════════════════════════════
  // ILLINOIS
  // ═══════════════════════════════════════
  'Chicago, IL': [
    { name: 'Pilsen',            emoji: '🌮', vibe: 'Murals · Mexican Classics' },
    { name: 'Little Village',    emoji: '🔥', vibe: 'Auténtico · Mercados' },
    { name: 'Humboldt Park',     emoji: '🇵🇷', vibe: 'Boricua · Jibaritos' },
    { name: 'Logan Square',      emoji: '🍜', vibe: 'Trendy · Fusion' },
    { name: 'Wicker Park',       emoji: '📸', vibe: 'Brunch · Eclectic' },
    { name: 'Back of the Yards', emoji: '💎', vibe: 'Hidden Gems · Local' },
    { name: 'West Loop',         emoji: '🥩', vibe: 'Chef-Driven · Fine Dining' },
    { name: 'Chinatown',         emoji: '🥟', vibe: 'Dim Sum · Hot Pot' },
    { name: 'Albany Park',       emoji: '🌍', vibe: 'Most Diverse · Global' },
    { name: 'Bronzeville',       emoji: '🍗', vibe: 'Soul Food · Bold Flavors' },
    { name: 'Devon Ave',         emoji: '🍛', vibe: 'South Asian · Biryani' },
    { name: 'Uptown',            emoji: '🍲', vibe: 'Vietnamese · Ethiopian' },
  ],
  'Aurora, IL': [
    { name: 'Downtown Aurora',   emoji: '🌮', vibe: 'Latin Main Street' },
    { name: 'East Side',         emoji: '🔥', vibe: 'Taquerías · Family' },
    { name: 'New York Street',   emoji: '🍜', vibe: 'Diverse Eats' },
    { name: 'Fox Valley',        emoji: '🛍️', vibe: 'Mall Area · Casual' },
  ],
  'Joliet, IL': [
    { name: 'Downtown Joliet',   emoji: '🌮', vibe: 'Historic · Mexican' },
    { name: 'East Side',         emoji: '🔥', vibe: 'Auténtico · Local' },
    { name: 'Crest Hill',        emoji: '🍔', vibe: 'Suburban Eats' },
    { name: 'Louis Rd Corridor', emoji: '🌍', vibe: 'Diverse Strip' },
  ],
  'Naperville, IL': [
    { name: 'Downtown Naperville', emoji: '🍷', vibe: 'Upscale · Brunch' },
    { name: 'South Naperville',    emoji: '🍛', vibe: 'Indian · South Asian' },
    { name: 'Ogden Ave',          emoji: '🌮', vibe: 'Casual · Tacos' },
    { name: 'Route 59',           emoji: '🌍', vibe: 'Global · Diverse' },
  ],
  'Elgin, IL': [
    { name: 'Downtown Elgin',   emoji: '🌮', vibe: 'Latino Heart · Taquerías' },
    { name: 'South Elgin',      emoji: '🍔', vibe: 'Family · Casual' },
    { name: 'McLean Blvd',      emoji: '🔥', vibe: 'Mexican Corridor' },
    { name: 'Dundee Ave',       emoji: '💎', vibe: 'Hidden Gems' },
  ],
  'Waukegan, IL': [
    { name: 'Downtown Waukegan', emoji: '🌮', vibe: 'Mexican · Salvadoran' },
    { name: 'Belvidere Rd',     emoji: '🔥', vibe: 'Latin Corridor' },
    { name: 'Grand Ave',        emoji: '🍜', vibe: 'Diverse Eats' },
    { name: 'North Chicago',    emoji: '💎', vibe: 'Local Gems' },
  ],
  'Cicero, IL': [
    { name: 'Cermak Road',      emoji: '🌮', vibe: 'Little Mexico' },
    { name: '26th Street',      emoji: '🔥', vibe: 'Tacos · Antojitos' },
    { name: 'Laramie Ave',      emoji: '🍲', vibe: 'Authentic · Markets' },
    { name: 'Roosevelt Rd',     emoji: '💎', vibe: 'Hidden Taquerías' },
  ],
  'Berwyn, IL': [
    { name: 'Cermak Road',      emoji: '🌮', vibe: 'Mexican · Czech' },
    { name: 'Roosevelt Rd',     emoji: '🍜', vibe: 'Diverse Strip' },
    { name: 'Depot District',   emoji: '🍺', vibe: 'Bars · Eats' },
    { name: 'Ogden Ave',        emoji: '💎', vibe: 'Local Favorites' },
  ],
  'Rockford, IL': [
    { name: 'Downtown Rockford', emoji: '🍔', vibe: 'Revitalized · Local' },
    { name: 'Broadway',          emoji: '🌮', vibe: 'Latino Eats' },
    { name: 'East State Street', emoji: '🌍', vibe: 'Diverse Corridor' },
    { name: 'Loves Park',        emoji: '🍕', vibe: 'Family · Italian' },
  ],
  'Springfield, IL': [
    { name: 'Downtown',         emoji: '🍔', vibe: 'Historic · Route 66' },
    { name: 'South Grand',      emoji: '🍜', vibe: 'Asian · Diverse' },
    { name: 'Dirksen Parkway',  emoji: '🌮', vibe: 'Latin Eats' },
    { name: 'West Side',        emoji: '🍗', vibe: 'Soul Food · BBQ' },
  ],
  'Champaign, IL': [
    { name: 'Campustown',       emoji: '🍜', vibe: 'Student Eats · Asian' },
    { name: 'Downtown Champaign', emoji: '🍷', vibe: 'Chef-Driven · Local' },
    { name: 'Green Street',     emoji: '🌍', vibe: 'Global · Diverse' },
    { name: 'North Prospect',   emoji: '🌮', vibe: 'Casual · Chains' },
  ],
  // Chicago suburbs / collar counties
  'Evanston, IL': [
    { name: 'Downtown Evanston', emoji: '🍷', vibe: 'Upscale · Brunch' },
    { name: 'Central Street',    emoji: '🍜', vibe: 'Diverse · Casual' },
    { name: 'Dempster Street',   emoji: '🌮', vibe: 'Latin · Middle Eastern' },
    { name: 'Howard Street',     emoji: '💎', vibe: 'Border Gems' },
  ],
  'Schaumburg, IL': [
    { name: 'Woodfield Area',   emoji: '🛍️', vibe: 'Mall Dining · Global' },
    { name: 'Golf Road',        emoji: '🍛', vibe: 'Indian · Korean' },
    { name: 'Higgins Road',     emoji: '🌮', vibe: 'Latin · Casual' },
    { name: 'Algonquin Road',   emoji: '🌍', vibe: 'Diverse Corridor' },
  ],

  // ═══════════════════════════════════════
  // INDIANA
  // ═══════════════════════════════════════
  'Gary, IN': [
    { name: 'Downtown Gary',    emoji: '🍗', vibe: 'Soul Food · BBQ' },
    { name: 'Broadway',         emoji: '🌮', vibe: 'Mexican · Local' },
    { name: 'Glen Park',        emoji: '💎', vibe: 'Hidden Gems' },
    { name: 'Miller Beach',     emoji: '🍔', vibe: 'Lakefront · Casual' },
  ],
  'East Chicago, IN': [
    { name: 'Indiana Harbor',   emoji: '🌮', vibe: 'Mexican · Auténtico' },
    { name: 'Main Street',      emoji: '🔥', vibe: 'Latin Corridor' },
    { name: 'Columbus Drive',   emoji: '🍲', vibe: 'Diverse · Local' },
    { name: 'Marktown',         emoji: '💎', vibe: 'Historic · Hidden' },
  ],
  'Hammond, IN': [
    { name: 'Downtown Hammond', emoji: '🌮', vibe: 'Mexican · Salvadoran' },
    { name: 'Calumet Ave',      emoji: '🍜', vibe: 'Diverse Strip' },
    { name: 'Hessville',        emoji: '🍗', vibe: 'BBQ · Comfort Food' },
    { name: 'Robertsdale',      emoji: '💎', vibe: 'Old School Local' },
  ],
  'Indianapolis, IN': [
    { name: 'West Washington St', emoji: '🌮', vibe: 'Latino Heart' },
    { name: 'Fountain Square',   emoji: '🍜', vibe: 'Trendy · Fusion' },
    { name: 'Mass Ave',          emoji: '🍷', vibe: 'Upscale · Cocktails' },
    { name: 'Broad Ripple',      emoji: '🍔', vibe: 'Casual · Bars' },
    { name: '38th Street',       emoji: '🌍', vibe: 'Global · Diverse' },
    { name: 'Irvington',         emoji: '💎', vibe: 'Hidden Gems' },
    { name: 'Speedway',          emoji: '🍗', vibe: 'BBQ · Comfort' },
    { name: 'Lafayette Square',  emoji: '🔥', vibe: 'Mercados · Auténtico' },
  ],
  'Fort Wayne, IN': [
    { name: 'Downtown',         emoji: '🍷', vibe: 'Revitalized · Local' },
    { name: 'South Side',       emoji: '🌮', vibe: 'Mexican · Burmese' },
    { name: 'Lima Road',        emoji: '🌍', vibe: 'Diverse Corridor' },
    { name: 'West Main St',     emoji: '💎', vibe: 'Hidden Gems' },
  ],
  'South Bend, IN': [
    { name: 'Downtown',         emoji: '🍷', vibe: 'Revitalized · Brunch' },
    { name: 'West Side',        emoji: '🌮', vibe: 'Mexican · Latino' },
    { name: 'Eddy Street',      emoji: '🍜', vibe: 'Student Eats · Trendy' },
    { name: 'Mishawaka',        emoji: '🌍', vibe: 'Diverse · Casual' },
  ],
  'Valparaiso, IN': [
    { name: 'Downtown Valpo',   emoji: '🍷', vibe: 'Charming · Local' },
    { name: 'Calumet Ave',      emoji: '🍔', vibe: 'Casual Corridor' },
    { name: 'Route 30',         emoji: '🌮', vibe: 'Latin · Diverse' },
    { name: 'Campus Area',      emoji: '🍜', vibe: 'Student Eats' },
  ],
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const city = (req.query.city || 'Chicago, IL').trim();

  // Exact match first
  let neighborhoods = CITY_NEIGHBORHOODS[city];

  // Fuzzy match on city name (handles "Chicago" without ", IL")
  if (!neighborhoods) {
    const cityLower = city.toLowerCase();
    const match = Object.keys(CITY_NEIGHBORHOODS).find(k =>
      cityLower.includes(k.split(',')[0].toLowerCase()) ||
      k.split(',')[0].toLowerCase().includes(cityLower.replace(/,?\s*(il|in|illinois|indiana)$/i, '').trim())
    );
    neighborhoods = match ? CITY_NEIGHBORHOODS[match] : null;
  }

  if (neighborhoods) {
    return res.status(200).json({ city, neighborhoods, cached: true });
  }

  // Fallback for unknown cities
  return res.status(200).json({
    city,
    neighborhoods: [
      { name: 'Downtown',        emoji: '🌮', vibe: 'Centro · Local' },
      { name: 'Latin Quarter',   emoji: '🔥', vibe: 'Auténtico · Sabor' },
      { name: 'Main Street',     emoji: '🌍', vibe: 'Diverse Eats' },
      { name: 'Local Favorites', emoji: '💎', vibe: 'Hidden Gems' },
    ],
    fallback: true,
  });
}
