"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

// Use a minimal CommonJS-safe adapter for Worker default export. No real network.
const source=fs.readFileSync(path.join(__dirname,"../cloudflare/worker.js"),"utf8");
const body=source.replace(/export default\s*\{/,"return {");
const RESPONSE=globalThis.Response;

function setup({symbols='[{"code":"3723","symbol":"TEST.TYO","name":"仮名テスト"}]',series=true}={}){
  const store=new Map();
  let apiCalls=0;
  const historical={};
  const date=new Date("2026-10-08T00:00:00Z");
  for(let n=0;n<40;n++){
    historical[date.toISOString().slice(0,10)]={
      "1. open":"100","2. high":"103","3. low":"99","4. close":"101","5. volume":"10000"
    };
    date.setUTCDate(date.getUTCDate()-1);
  }
  const mockFetch=async(url)=>{
    apiCalls++;
    const ticker=new URL(url).searchParams.get("symbol");
    return new RESPONSE(JSON.stringify(series?{"Meta Data":{"2. Symbol":ticker},"Time Series (Daily)":historical}:{"Information":"No free data"}),{status:200});
  };
  const api=new Function("fetch","Response","AbortSignal",body)(
    mockFetch,RESPONSE,{timeout:()=>AbortSignal.timeout(10000)}
  );
  const env={
    STOCKMAN_ACCESS_KEY:"test-personal-token",
    ALPHAVANTAGE_API_KEY:"test-provider-token",
    STOCKMAN_SYMBOLS:symbols,
    MARKET_CACHE:{
      get:async k=>JSON.parse(store.get(k)||"null"),
      put:async(k,v)=>{store.set(k,v);}
    }
  };
  const request=(auth,method="GET",origin="https://hiroto1209-sketch.github.io")=>({
    method,url:"https://example.workers.dev/api/daily-input",
    headers:new Headers({"Origin":origin,"X-Stockman-Key":auth})
  });
  return {api,env,request,store,getCalls:()=>apiCalls};
}

test("401 for wrong Stock man key",async()=>{
  const {api,env,request}=setup();
  const r=await api.fetch(request("wrong-key"),env);
  assert.equal(r.status,401);
});

test("fully private verified daily data can be returned to authorized user",async()=>{
  const {api,env,request}=setup();
  const result=await api.fetch(request("test-personal-token"),env);
  assert.equal(result.status,200);
  const body=await result.json();
  assert.equal(body.format,"stockman-private-ohlcv-v1");
  assert.equal(body.candidates.length,1);
  assert.equal(body.candidates[0].candles.length>=25,true);
  assert.equal(JSON.stringify(body).includes("test-provider-token"),false);
  assert.equal(result.headers.get("Access-Control-Allow-Origin"),"https://hiroto1209-sketch.github.io");
});

test("repeated request uses private cache instead of new API request",async()=>{
  const {api,env,request,getCalls}=setup();
  await api.fetch(request("test-personal-token"),env);
  await api.fetch(request("test-personal-token"),env);
  assert.equal(getCalls(),1);
});

test("provider with no supported Japan data fails closed",async()=>{
  const {api,env,request}=setup({series:false});
  const result=await api.fetch(request("test-personal-token"),env);
  assert.equal(result.status,503);
  const body=await result.json();
  assert.equal(body.status,"UNAVAILABLE");
  assert.equal(body.candidates.length,0);
});

test("unsupported code never replaced with a different ticker",async()=>{
  const {api,env,request}=setup({symbols:'[{"code":"invalid","symbol":"AAPL","name":"wrong"}]'});
  const response=await api.fetch(request("test-personal-token"),env);
  assert.equal(response.status,503);
});

test("CORS only trusts the owner's Github Pages origin",async()=>{
  const {api,env,request}=setup();
  const response=await api.fetch(request("test-personal-token","GET","https://attacker.invalid"),env);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"),null);
});
