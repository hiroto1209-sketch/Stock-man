/**
 * Stock man — private iPhone-only market feed (Cloudflare Workers Free).
 * Source: Alpha Vantage TIME_SERIES_DAILY, free up to 25 requests/day.
 * The API provider's license permits personal use, NOT redistribution.
 * Never publish the data to the public GitHub repository.
 *
 * Cloudflare secrets: ALPHAVANTAGE_API_KEY, STOCKMAN_ACCESS_KEY.
 * Variable STOCKMAN_SYMBOLS: JSON array of {code,symbol,name} (max 5).
 * KV binding MARKET_CACHE: private storage of permitted personal data.
 *
 * Never includes trading/order functionality.
 */
const ALLOWED_ORIGIN = "https://hiroto1209-sketch.github.io";
const CACHE_KEY = "stockman:v1:private-ohlcv";
const FORMAT = "stockman-private-ohlcv-v1";
const MIN_REFRESH_MS = 3 * 60 * 60 * 1000; // 3h min between provider calls
const MAX_SYMBOLS = 5;

const positive = x => Number.isFinite(Number(x)) && Number(x) > 0;
const asDay = x => String(x ?? "").slice(0,10);
function respond(payload,status=200,origin=""){
  const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
  if(origin===ALLOWED_ORIGIN){
    headers["Access-Control-Allow-Origin"]=ALLOWED_ORIGIN;
    headers["Access-Control-Allow-Headers"]="X-Stockman-Key, Content-Type";
    headers["Access-Control-Allow-Methods"]="GET, OPTIONS";
    headers["Vary"]="Origin";
  }
  return new Response(JSON.stringify(payload),{status,headers});
}
function safeEqual(a,b){
  if(typeof a!=="string"||typeof b!=="string"||!b.length)return false;
  let acc=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++)acc|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return acc===0;
}
function configuredSymbols(env){
  let parsed;
  try{parsed=JSON.parse(String(env.STOCKMAN_SYMBOLS||"[]"))}catch{return []}
  if(!Array.isArray(parsed))return [];
  const unique=new Set();
  return parsed.filter(entry=>{
    const code=String(entry?.code||"").trim();
    const symbol=String(entry?.symbol||"").trim().toUpperCase();
    if(!/^\d{4,5}$/.test(code)||!/^[A-Z0-9.:-]{3,22}$/.test(symbol)||unique.has(code))return false;
    unique.add(code);return true;
  }).slice(0,MAX_SYMBOLS).map(x=>({code:String(x.code),symbol:String(x.symbol).toUpperCase(),name:String(x.name||x.code).slice(0,80)}));
}
function normalizeRows(json,expectedSymbol){
  if(!json||typeof json!=="object"||json["Error Message"]||json.Note||json.Information)return {candles:[],reason:"PROVIDER_UNAVAILABLE"};
  const series=json["Time Series (Daily)"];
  if(!series||typeof series!=="object")return {candles:[],reason:"NO_DAILY_OHLCV"};
  const providerSymbol=String(json["Meta Data"]?.["2. Symbol"]||"").trim().toUpperCase();
  if(providerSymbol&&providerSymbol!==expectedSymbol)return {candles:[],reason:"SYMBOL_MISMATCH"};
  const candles=Object.entries(series).map(([day,b])=>{
    const open=Number(b["1. open"]),high=Number(b["2. high"]),low=Number(b["3. low"]),close=Number(b["4. close"]),volume=Number(b["5. volume"]);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||![open,high,low,close,volume].every(Number.isFinite))return null;
    if(!positive(open)||!positive(high)||!positive(low)||!positive(close)||volume<0||high<Math.max(open,close,low)||low>Math.min(open,close,high))return null;
    return {time:day,open,high,low,close,volume};
  }).filter(Boolean).sort((a,b)=>a.time.localeCompare(b.time)).slice(-100);
  return {candles,reason:candles.length>=25?null:"INSUFFICIENT_HISTORY"};
}
function cacheUnexpired(payload,now){
  return payload&&Array.isArray(payload.candidates)&&
    Number.isFinite(Date.parse(payload.fetchedAt))&&
    now-Date.parse(payload.fetchedAt)<MIN_REFRESH_MS;
}
async function loadCached(env){
  if(!env.MARKET_CACHE||typeof env.MARKET_CACHE.get!=="function")return null;
  try{return await env.MARKET_CACHE.get(CACHE_KEY,"json")}catch{return null}
}
async function refreshFeed(env,{force=false}={}){
  const old=await loadCached(env);
  const now=Date.now();
  if(!force&&cacheUnexpired(old,now))return old;
  const stocks=configuredSymbols(env);
  if(!env.MARKET_CACHE||!env.ALPHAVANTAGE_API_KEY||!stocks.length)
    return {format:FORMAT,status:"UNAVAILABLE",fetchedAt:new Date().toISOString(),reason:"CONFIG_REQUIRED",candidates:[]};

  const candidates=[],failures=[];
  // Sequential calls avoid burst/rate pressure. At most 5 symbols per run.
  for(const stock of stocks){
    try{
      const u=new URL("https://www.alphavantage.co/query");
      u.searchParams.set("function","TIME_SERIES_DAILY");
      u.searchParams.set("symbol",stock.symbol);
      u.searchParams.set("outputsize","compact");
      u.searchParams.set("apikey",env.ALPHAVANTAGE_API_KEY);
      const response=await fetch(u.toString(),{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error("PROVIDER_HTTP_"+response.status);
      const data=await response.json();
      const normalized=normalizeRows(data,stock.symbol);
      if(normalized.candles.length<25)throw new Error(normalized.reason||"INSUFFICIENT_HISTORY");
      candidates.push({code:stock.code,name:stock.name,sourceSymbol:stock.symbol,candles:normalized.candles,catalysts:[]});
    }catch(error){
      failures.push({code:stock.code,reason:String(error?.message||"UNAVAILABLE").slice(0,80)});
    }
  }
  // Do not silently reuse yesterday's stale cache after all requests failed.
  const latest=candidates.map(c=>c.candles.at(-1)?.time).filter(Boolean).sort().at(-1)||null;
  const payload={format:FORMAT,status:candidates.length?"DAILY":"UNAVAILABLE",
    fetchedAt:new Date(now).toISOString(),dataAsOf:latest,
    source:"Alpha Vantage / personal-use only",candidates,failures};
  await env.MARKET_CACHE.put(CACHE_KEY,JSON.stringify(payload),{expirationTtl:60*60*24*30});
  return payload;
}
async function handler(request,env){
  const origin=request.headers.get("Origin")||"";
  if(request.method==="OPTIONS"){
    if(origin!==ALLOWED_ORIGIN)return respond({error:"CORS_DENIED"},403,origin);
    return new Response(null,{status:204,headers:{
      "Access-Control-Allow-Origin":ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods":"GET, OPTIONS",
      "Access-Control-Allow-Headers":"X-Stockman-Key, Content-Type",
      "Access-Control-Max-Age":"600","Vary":"Origin"
    }});
  }
  const url=new URL(request.url);
  if(url.pathname!=="/api/daily-input"||request.method!=="GET")
    return respond({error:"NOT_FOUND"},404,origin);
  if(!safeEqual(request.headers.get("X-Stockman-Key"),env.STOCKMAN_ACCESS_KEY))
    return respond({error:"UNAUTHORIZED"},401,origin);
  let result=await loadCached(env);
  if(!result) result=await refreshFeed(env);
  if(!result.candidates?.length){
    return respond({format:FORMAT,status:"UNAVAILABLE",fetchedAt:result.fetchedAt,reason:result.reason||"PROVIDER_DATA_UNAVAILABLE",candidates:[],failures:result.failures||[]},503,origin);
  }
  return respond(result,200,origin);
}
export default {
  fetch:handler,
  async scheduled(event,env,ctx){
    // Two cron slots, but no more than one provider refresh in a 3h window.
    ctx.waitUntil(refreshFeed(env).catch(e=>console.error("STOCKMAN_PROVIDER_REFRESH_FAILED",String(e))));
  }
};
