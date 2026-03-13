// api/home-feed.js
import Anthropic from '@anthropic-ai/sdk';
const cache = new Map();
const SECTION_PROMPTS = {
  en_fuego:'the most on-fire, buzzing, hottest right now restaurants',
  joyas_ocultas:'the best hidden gem / under-the-radar local restaurants',
  subiendo_fuerte:'the fastest rising, newest trending restaurants',
  nuevos_spots:'the newest restaurant openings',
  los_mejores:'the highest-rated, most acclaimed restaurants',
  tu_barrio:'the best neighborhood, local-favorite restaurants',
  hot:'the most on-fire, buzzing, hottest right now restaurants',
  gems:'the best hidden gem / under-the-radar local restaurants',
  trending:'the fastest rising, newest trending restaurants',
  new:'the newest restaurant openings',
  rated:'the highest-rated, most acclaimed restaurants',
  local:'the best neighborhood, local-favorite restaurants',
};
async function getPlaceDetails(name,city,apiKey){
  try{
    const r=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':'places.id,places.rating,places.userRatingCount,places.priceLevel,places.formattedAddress,places.currentOpeningHours,places.location,places.photos'},body:JSON.stringify({textQuery:`${name} restaurant ${city}`,maxResultCount:1})});
    const d=await r.json();
    const p=d.places?.[0];
    if(!p)return null;
    const price={'PRICE_LEVEL_INEXPENSIVE':'$','PRICE_LEVEL_MODERATE':'$$','PRICE_LEVEL_EXPENSIVE':'$$$','PRICE_LEVEL_VERY_EXPENSIVE':'$$$$'};
    return{photo:p.photos?.[0]?.name?`https://sabor-api.vercel.app/api/photo?ref=${encodeURIComponent(p.photos[0].name)}`:null,rating:p.rating??null,reviews:p.userRatingCount??null,price:price[p.priceLevel]??null,address:p.formattedAddress??null,isOpen:p.currentOpeningHours?.openNow??null,latitude:p.location?.latitude??null,longitude:p.location?.longitude??null};
  }catch(e){return null;}
}
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS')return res.status(200).end();
  const city=req.query.city||'Chicago';
  const section=req.query.section||'en_fuego';
  const count=parseInt(req.query.count||'3',10);
  const key=`${city}:${section}:${count}`;
  const hit=cache.get(key);
  if(hit&&Date.now()-hit.ts<300000)return res.status(200).json(hit.data);
  const ak=process.env.ANTHROPIC_API_KEY,pk=process.env.GOOGLE_PLACES_KEY;
  if(!ak)return res.status(500).json({error:'ANTHROPIC_API_KEY not set'});
  if(!pk)return res.status(500).json({error:'GOOGLE_PLACES_KEY not set'});
  const desc=SECTION_PROMPTS[section]||SECTION_PROMPTS.en_fuego;
  const anthropic=new Anthropic({apiKey:ak});
  const exampleItems=Array.from({length:count},(_,i)=>`{"name":"Restaurant ${i+1}","cuisine":"Cuisine","emoji":"🌮","vibe":"Vibe"}`).join(',');
  const msg=await anthropic.messages.create({model:'claude-sonnet-4-20250514',max_tokens:600,messages:[{role:'user',content:`You are a local food expert for ${city}. Pick exactly ${count} real, distinct restaurants that are ${desc} in ${city}. Each must be a different restaurant. Respond ONLY with valid JSON, no markdown: {"restaurants":[${exampleItems}]}`}]});
  const parsed=JSON.parse(msg.content[0].text.replace(/```json|```/g,'').trim());
  const items=await Promise.all(parsed.restaurants.map(async r=>({name:r.name,displayName:r.name,cuisine:r.cuisine,emoji:r.emoji,vibe:r.vibe,places:await getPlaceDetails(r.name,city,pk)})));
  const data={items};
  cache.set(key,{ts:Date.now(),data});
  return res.status(200).json(data);
}
