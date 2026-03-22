// api/places-enrich.js
async function getPlaceDetails(name,city,apiKey){
  try{
    // Step 1: Search for the place
    const r=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':'places.rating,places.userRatingCount,places.priceLevel,places.formattedAddress,places.addressComponents,places.currentOpeningHours,places.location,places.photos'},body:JSON.stringify({textQuery:`${name} restaurant ${city}`,maxResultCount:1})});
    const d=await r.json();
    const p=d.places?.[0];
    if(!p)return null;
    const price={'PRICE_LEVEL_INEXPENSIVE':'$','PRICE_LEVEL_MODERATE':'$$','PRICE_LEVEL_EXPENSIVE':'$$$','PRICE_LEVEL_VERY_EXPENSIVE':'$$$$'};
    
    // Step 2: Extract neighborhood from addressComponents
    let neighborhood = null;
    if (p.addressComponents) {
      // Try sublocality first (neighborhood), then locality (city)
      const sublocalityComp = p.addressComponents.find(c => 
        c.types?.includes('sublocality') || c.types?.includes('sublocality_level_1') || c.types?.includes('neighborhood'));
      const localityComp = p.addressComponents.find(c => c.types?.includes('locality'));
      neighborhood = sublocalityComp?.longText || localityComp?.longText || null;
    }
    
    return{
      photo:p.photos?.[0]?.name?`https://sabor-api.vercel.app/api/photo?ref=${encodeURIComponent(p.photos[0].name)}`:null,
      rating:p.rating??null,
      reviews:p.userRatingCount??null,
      price:price[p.priceLevel]??null,
      address:p.formattedAddress??null,
      neighborhood:neighborhood,
      isOpen:p.currentOpeningHours?.openNow??null,
      latitude:p.location?.latitude??null,
      longitude:p.location?.longitude??null
    };
  }catch(e){return null;}
}
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const pk=process.env.GOOGLE_PLACES_KEY;
  if(!pk)return res.status(500).json({error:'GOOGLE_PLACES_KEY not set'});
  const{restaurants,city}=req.body;
  if(!restaurants||!city)return res.status(400).json({error:'restaurants and city required'});
  const enriched=await Promise.all(restaurants.slice(0,10).map(async r=>{
    const name=r.name||r.n||'';
    return{name,places:name?await getPlaceDetails(name,city,pk):null};
  }));
  return res.status(200).json({enriched});
}
