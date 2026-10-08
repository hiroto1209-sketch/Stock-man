"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const E=require("../engine/analysis-core.js");
function generateBars(end="2026-10-08",count=40,vol=100000){
  const date=new Date(end+"T00:00:00Z"),rows=[];
  while(rows.length<count){
    const dow=date.getUTCDay();
    if(dow!==0&&dow!==6){
      const i=count-rows.length,close=1000+i*2;
      rows.push({time:date.toISOString().slice(0,10),open:close-2,high:close+8,low:close-6,close,volume:vol});
    }
    date.setUTCDate(date.getUTCDate()-1);
  }
  return rows.sort((a,b)=>a.time.localeCompare(b.time));
}
const asOf="2026-10-08T18:00:00+09:00";
function input(overrides={}){
  return {
    asOf,
    source:{status:"DAILY",asOf:"2026-10-08T15:30:00+09:00",provider:"licensed test fixture",redistributionPermitted:true,licenseUrl:"https://example.com/license"},
    market:{status:"NEUTRAL",verified:true,note:"verified"},
    candidates:[{code:"1234",name:"検証会社",candles:generateBars(),catalysts:[]}],
    ...overrides
  };
}
test("valid licensed input yields a research snapshot",()=>{
  const result=E.analyze(input(),{now:asOf,publicOutput:true});
  assert.equal(result.meta.mode,"AUTO_DAILY");
  assert.equal(result.candidates.length,1);
  assert.equal(result.candidates[0].price!==null,true);
  assert.equal(result.candidates[0].tradeScore<=59,true);
  assert.equal(result.candidates[0].decision,"監視のみ・寄り後の確認待ち");
});
test("missing data never generates a phantom pick",()=>{
  const result=E.unavailable("missing",asOf);
  assert.equal(result.meta.mode,"UNAVAILABLE");
  assert.equal(result.candidates.length,0);
});
test("12-week-delayed data rejected as current",()=>{
  const old=input({
    source:{status:"DAILY",asOf:"2026-07-10T15:30:00+09:00",provider:"delayed",redistributionPermitted:true,licenseUrl:"https://example.com/license"},
    candidates:[{code:"1234",name:"検証会社",candles:generateBars("2026-07-10")}]
  });
  const result=E.analyze(old,{now:asOf,publicOutput:true});
  assert.equal(result.meta.mode,"UNAVAILABLE");
  assert.equal(result.candidates.length,0);
});
test("private/nonredistributable data cannot be published",()=>{
  assert.throws(()=>E.analyze(input({source:{status:"DAILY",asOf,provider:"private"}}),{now:asOf,publicOutput:true}),/PUBLICATION_DENIED/);
});
test("invalid OHLC and missing volume do not fabricate indicators",()=>{
  const rows=E.barsOf([{time:"2026-10-08",open:100,high:101,low:110,close:100},{time:"2026-10-07",open:100,high:105,low:98,close:104,volume:null}]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].volume,null);
});
test("future/unverified disclosures cannot be catalysts",()=>{
  const raw=input();
  raw.candidates[0].catalysts=[{type:"buyback",headline:"自社株取得を発表",verified:true,url:"https://example.com/ir",publishedAt:"2026-10-09T20:00:00+09:00"}];
  const result=E.analyze(raw,{now:asOf,publicOutput:true});
  assert.equal(result.candidates[0].components.catalyst,0);
});
test("zero candles produces no active recommendations",()=>{
  const raw=input();
  raw.candidates[0].candles=[];
  const result=E.analyze(raw,{now:asOf,publicOutput:true});
  assert.equal(result.meta.mode,"UNAVAILABLE");
  assert.equal(result.candidates.length,0);
});
test("capital data never propagates to public snapshot",()=>{
  const raw=input();
  raw.accountBalance=100000;
  const output=JSON.stringify(E.analyze(raw,{now:asOf,publicOutput:true}));
  assert.equal(output.includes("accountBalance"),false);
  assert.equal(output.includes("BUY NOW"),false);
});

test("future candles are not used for today's prediction",()=>{
  const raw=input();
  raw.candidates[0].candles.push({time:"2026-10-09",open:500,high:600,low:400,close:599,volume:800000});
  const result=E.analyze(raw,{now:asOf,publicOutput:true});
  assert.equal(result.candidates[0].price!==599,true);
});
test("unverified bullish market never grants a bonus",()=>{
  const raw=input({market:{status:"RISK_ON",verified:false}});
  const result=E.analyze(raw,{now:asOf,publicOutput:true});
  assert.equal(result.marketRegime.status,"UNKNOWN");
  assert.equal(result.candidates[0].components.marketRegime,0);
});
test("future-dated provider snapshot is not current",()=>{
  const raw=input({source:{status:"DAILY",asOf:"2026-10-09",redistributionPermitted:true,licenseUrl:"https://example.com/license"}});
  const result=E.analyze(raw,{now:asOf,publicOutput:true});
  assert.equal(result.meta.mode,"UNAVAILABLE");
});
