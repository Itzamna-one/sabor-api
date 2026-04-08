// api/neighborhoods.js — Neighborhood data per city/metro (hardcoded for speed)
// No AI call needed — neighborhoods don't change. Add new cities as we expand.
import { checkAppKey } from '../lib/sabor-security.js';

const CITY_NEIGHBORHOODS = {
  // ═══════════════════════════════════════
  // ILLINOIS
  // ═══════════════════════════════════════
  'Chicago, IL': [
    // ── West / Southwest ──
    { name: 'Pilsen',            emoji: '🌮', vibe: 'Murals · Mexican Classics' },
    { name: 'Little Village',    emoji: '🔥', vibe: 'Auténtico · Mercados' },
    { name: 'Humboldt Park',     emoji: '🇵🇷', vibe: 'Boricua · Jibaritos' },
    { name: 'East Garfield Park', emoji: '💎', vibe: 'Soul Food · Local · Emerging' },
    { name: 'West Garfield Park', emoji: '🍗', vibe: 'BBQ · Comfort · Hidden' },
    { name: 'Back of the Yards', emoji: '💎', vibe: 'Hidden Gems · Local' },
    { name: 'Brighton Park',     emoji: '🌮', vibe: 'Mexican · Family' },
    { name: 'Gage Park',         emoji: '🔥', vibe: 'Taquerías · Authentic' },
    { name: 'Archer Heights',    emoji: '🌯', vibe: 'Polish-Mexican · Local' },
    { name: 'Marquette Park',    emoji: '💎', vibe: 'Hidden · Neighborhood' },
    { name: 'Chicago Lawn',      emoji: '🌮', vibe: 'Mexican · Middle Eastern' },
    // ── North / Northwest ──
    { name: 'Logan Square',      emoji: '🍜', vibe: 'Trendy · Fusion' },
    { name: 'Wicker Park',       emoji: '📸', vibe: 'Brunch · Eclectic' },
    { name: 'Albany Park',       emoji: '🌍', vibe: 'Most Diverse · Global' },
    { name: 'Devon Ave',         emoji: '🍛', vibe: 'South Asian · Biryani' },
    { name: 'Uptown',            emoji: '🍲', vibe: 'Vietnamese · Ethiopian' },
    { name: 'Lakeview',          emoji: '🍣', vibe: 'Ramen · Thai · Brunch' },
    { name: 'Lincoln Park',      emoji: '🍷', vibe: 'Upscale · Date Night' },
    { name: 'Andersonville',     emoji: '🌍', vibe: 'International · Ethiopian' },
    { name: 'Rogers Park',       emoji: '🌮', vibe: 'Jamaican · Mexican · Diverse' },
    { name: 'Irving Park',       emoji: '🌮', vibe: 'Mexican · Korean · Local' },
    { name: 'Portage Park',      emoji: '🍕', vibe: 'Polish · Italian · Family' },
    // ── South Side ──
    { name: 'Bridgeport',        emoji: '🥟', vibe: 'Local Gems · Chinese · Italian' },
    { name: 'Chinatown',         emoji: '🥟', vibe: 'Dim Sum · Hot Pot' },
    { name: 'Bronzeville',       emoji: '🍗', vibe: 'Soul Food · Bold Flavors' },
    { name: 'Hyde Park',         emoji: '🍛', vibe: 'Campus · Diverse · Soul Food' },
    { name: 'South Chicago',     emoji: '🌮', vibe: 'Traditional Mexican · Seafood' },
    { name: 'Chatham',           emoji: '🍗', vibe: 'Soul Food · BBQ · Comfort' },
    { name: 'Englewood',         emoji: '🍗', vibe: 'Soul Food · BBQ · Local' },
    { name: 'Auburn Gresham',    emoji: '💎', vibe: 'Hidden · Comfort Food' },
    { name: 'Roseland',          emoji: '🍗', vibe: 'BBQ · Fish · Comfort' },
    { name: 'Pullman',           emoji: '✨', vibe: 'Historic · Emerging Eats' },
    // ── Southwest Suburbs (in city limits) ──
    { name: 'Clearing',          emoji: '🌮', vibe: 'Mexican · Polish · Local' },
    { name: 'Garfield Ridge',    emoji: '🍔', vibe: 'Midway Area · Casual' },
    // ── Near Southwest Suburbs ──
    { name: 'Oak Lawn',          emoji: '🍽️', vibe: 'Diverse · Family · Arabic' },
    { name: 'Berwyn',            emoji: '🌮', vibe: 'Mexican-Czech · Cermak Rd' },
    { name: 'Cicero',            emoji: '🔥', vibe: 'Little Mexico · Antojitos' },
    { name: 'Evergreen Park',    emoji: '🍔', vibe: 'Local · Family Dining' },
    // ── Downtown / Near ──
    { name: 'West Loop',         emoji: '🥩', vibe: 'Chef-Driven · Randolph Row' },
    { name: 'West Town',         emoji: '✨', vibe: 'Young Chefs · Creative' },
    { name: 'River North',       emoji: '🍸', vibe: 'Nightlife · Steakhouses' },
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
  'Evansville, IN': [
    { name: 'Downtown',         emoji: '🍷', vibe: 'Revitalized · Local' },
    { name: 'West Franklin St', emoji: '🌮', vibe: 'Mexican · Latino' },
    { name: 'North Side',       emoji: '🍗', vibe: 'BBQ · Comfort Food' },
    { name: 'East Side',        emoji: '🌍', vibe: 'Diverse · Family' },
    { name: 'Haynie\'s Corner', emoji: '💎', vibe: 'Arts District · Hidden Gems' },
  ],

  // ═══════════════════════════════════════
  // ILLINOIS — ADDITIONAL CITIES
  // ═══════════════════════════════════════
  'Peoria, IL': [
    { name: 'Downtown Peoria',  emoji: '🍷', vibe: 'Riverfront · Local' },
    { name: 'University St',    emoji: '🍜', vibe: 'Student Eats · Asian' },
    { name: 'War Memorial Dr',  emoji: '🌮', vibe: 'Latin · Diverse' },
    { name: 'East Bluff',       emoji: '🍗', vibe: 'Soul Food · BBQ' },
    { name: 'Heights',          emoji: '💎', vibe: 'Hidden Gems · Local' },
  ],
  'Bloomington, IL': [
    { name: 'Downtown Bloomington', emoji: '🍷', vibe: 'Historic · Upscale' },
    { name: 'Veterans Parkway',     emoji: '🌍', vibe: 'Diverse Corridor' },
    { name: 'Normal (Uptown)',      emoji: '🍜', vibe: 'Student Eats · ISU' },
    { name: 'East Side',            emoji: '🌮', vibe: 'Latin · Casual' },
  ],
  'Decatur, IL': [
    { name: 'Downtown Decatur',  emoji: '🍷', vibe: 'Revitalized · Local' },
    { name: 'Merchant Street',   emoji: '🍔', vibe: 'Classic American' },
    { name: 'East Side',         emoji: '🌮', vibe: 'Mexican · Family' },
    { name: 'South Side',        emoji: '🍗', vibe: 'BBQ · Comfort Food' },
  ],
  'DeKalb, IL': [
    { name: 'Downtown DeKalb',  emoji: '🍜', vibe: 'Student Eats · NIU' },
    { name: 'Lincoln Highway',  emoji: '🌮', vibe: 'Mexican · Diverse' },
    { name: 'Sycamore',         emoji: '💎', vibe: 'Small Town · Hidden Gems' },
    { name: 'Annie Glidden Rd', emoji: '🌍', vibe: 'Global · Casual' },
  ],

  // ═══════════════════════════════════════
  // INDIANA — ADDITIONAL CITIES
  // ═══════════════════════════════════════
  'Bloomington, IN': [
    { name: 'Downtown / Kirkwood', emoji: '🍷', vibe: 'Student Eats · IU' },
    { name: '4th Street',          emoji: '🍜', vibe: 'Diverse · Asian' },
    { name: 'East 3rd Street',     emoji: '🌮', vibe: 'Mexican · Casual' },
    { name: 'College Mall Area',   emoji: '🌍', vibe: 'Diverse Corridor' },
  ],
  'Terre Haute, IN': [
    { name: 'Downtown',         emoji: '🍷', vibe: 'Revitalized · Local' },
    { name: 'Wabash Ave',       emoji: '🌮', vibe: 'Mexican · Family' },
    { name: 'South Side',       emoji: '🍗', vibe: 'BBQ · Comfort Food' },
    { name: 'ISU Campus Area',  emoji: '🍜', vibe: 'Student Eats' },
  ],
  'Lafayette, IN': [
    { name: 'Downtown Lafayette', emoji: '🍷', vibe: 'Local · Eclectic' },
    { name: 'Sagamore Parkway',   emoji: '🌍', vibe: 'Diverse Corridor' },
    { name: 'West Lafayette',     emoji: '🍜', vibe: 'Purdue · Student Eats' },
    { name: 'Main Street',        emoji: '🌮', vibe: 'Mexican · Casual' },
  ],
  'Muncie, IN': [
    { name: 'Downtown Muncie',  emoji: '🍷', vibe: 'Revitalized · Local' },
    { name: 'Village Area',     emoji: '🍜', vibe: 'Student Eats · BSU' },
    { name: 'McGalliard Rd',    emoji: '🌍', vibe: 'Diverse · Casual' },
    { name: 'South Side',       emoji: '🌮', vibe: 'Mexican · Family' },
  ],
  'Michigan City, IN': [
    { name: 'Downtown',         emoji: '🍷', vibe: 'Lakefront · Local' },
    { name: 'Franklin Street',  emoji: '🌮', vibe: 'Latin · Diverse' },
    { name: 'Uptown Arts',      emoji: '💎', vibe: 'Arts District · Hidden' },
    { name: 'Lighthouse Place', emoji: '🍔', vibe: 'Casual · Family' },
  ],
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAppKey(req)) return res.status(401).json({ error: 'Unauthorized' });
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
