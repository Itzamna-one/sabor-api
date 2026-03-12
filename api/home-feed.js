// api/home-feed.js
const Anthropic = require('@anthropic-ai/sdk');
const cache = new Map();
const SECTION_PROMPTS = {
  en_fuego:'the 3 most on-fire, buzzing, hottest right now restaurants',
  joyas_ocultas:'the 3 best hidden gem / under-the-radar local restaurants',
  subiendo_fuerte:'the 3 fastest rising, newest trending restaurants',
  nuevos_spots:'the 3 newest restaurant openings',
  los_mejores:'the 3 highest-rated, most acclaimed restaurants',
  tu_barrio:'the 3 best neighborhood, local-favorite restaurants',
};
async function getPlaceDetails(name,city,apiKey){
  try{
    const r=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':'places.id,places.rating,places.userRatingCount,places.priceLevel,places.formattedAddress,places.currentOpeningHours,places.location,places.photos'},body:JSON.stringify({textQuery:`${name} restaurant ${city}`,maxResultCount:1})});
    const d=await r.json();
    const p=d.places?.[0];
    if(!p)return null;
    const price={'PRICE_LEVEL_INEXPENSIVE':'$','PRICE_LEVEL_MODERATE':'$$','PRICE_LEVEL_EXPENSIVE':'$$$','PRICE_LEVEL_VERY_EXPENSIVE':'$$$$'};
    return{photo:p.photos?.[0]?.name?`https://places.googleapis.com/v1/${p.photos[0].name}/media?maxHeightPx=600&maxWidthPx=800&key=${apiKey}`:null,rating:p.rating??null,reviews:p.userRatingCount??null,price:price[p.priceLevel]??null,address:p.formattedAddress??null,isOpen:p.currentOpeningHours?.openNow??null,latitude:p.location?.latitude??null,longitude:p.location?.longitude??null};
  }catch(e){return null;}
}
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS')return res.status(200).end();
  const city=req.query.city||'Chicago';
  const section=req.query.section||'en_fuego';
  const key=`${city}:${section}`;
  const hit=cache.get(key);
  if(hit&&Date.now()-hit.ts<300000)return res.status(200).json(hit.data);
  const ak=process.env.ANTHROPIC_API_KEY,pk=process.env.GOOGLE_PLACES_KEY;
  if(!ak)return res.status(500).json({error:'ANTHROPIC_API_KEY not set'});
  if(!pk)return res.status(500).json({error:'GOOGLE_PLACES_KEY not set'});
  const desc=SECTION_PROMPTS[section]||SECTION_PROMPTS.en_fuego;
  const anthropic=new Anthropic({apiKey:ak});
  const msg=await anthropic.messages.create({model:'claude-opus-4-5',max_tokens:400,messages:[{role:'user',content:`You are a local food expert for ${city}. Pick exactly 3 real restaurants that are ${desc} in ${city}. Respond ONLY with valid JSON, no markdown: {"restaurants":[{"name":"Exact Name","cuisine":"Mexican","emoji":"🌮","vibe":"Lively"},{"name":"...","cuisine":"...","emoji":"...","vibe":"..."},{"name":"...","cuisine":"...","emoji":"...","vibe":"..."}]}`}]});
  const parsed=JSON.parse(msg.content[0].text.replace(/```json|```/g,'').trim());
  const items=await Promise.all(parsed.restaurants.map(async r=>({name:r.name,displayName:r.name,cuisine:r.cuisine,emoji:r.emoji,vibe:r.vibe,places:await getPlaceDetails(r.name,city,pk)})));
  const data={items};
  cache.set(key,{ts:Date.now(),data});
  return res.status(200).json(data);
}
