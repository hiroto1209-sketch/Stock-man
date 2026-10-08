/* Stock man Automatic Daily Analysis Engine — deterministic, dependency-free.
 * This module NEVER fetches data, guesses an unknown fact, or sends orders.
 * Compatible with Node.js CommonJS and GitHub Pages plain JS.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports) module.exports=api;
  else root.StockManEngine=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const VERSION="1.0.0";
  const MIN_BARS=25;
  const MAX_CALENDAR_AGE_DAYS=4;
  const WEIGHTS=Object.freeze({catalyst:30,momentum:20,volume:15,relativeStrength:15,orderFlow:10,marketRegime:10});
  const allowedRegimes=new Set(["RISK_ON","NEUTRAL","RISK_OFF","UNKNOWN"]);

  function n(x){return (x===null||x===undefined||x==="")?NaN:Number(x);}
  function finite(x){return Number.isFinite(n(x));}
  function round(x,p=2){return Number.isFinite(x)?Math.round(x*10**p)/10**p:null;}
  function clamp(x,min,max){return Math.max(min,Math.min(max,x));}
  function avg(xs){return xs.reduce((a,b)=>a+b,0)/xs.length;}
  function datePart(value){return String(value||"").slice(0,10);}
  function tokyoDate(ts){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(ts));}
  function ageDays(day,now){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return Infinity;
    const t=Date.parse(day+"T15:30:00+09:00");
    if(!Number.isFinite(t))return Infinity;
    return Math.max(0,(new Date(now).getTime()-t)/86400000);
  }
  function barsOf(source){
    const byDate=new Map();
    for(const row of (Array.isArray(source)?source:[])){
      if(!row||typeof row!=="object")continue;
      const date=datePart(row.time||row.date);
      const o=n(row.open),h=n(row.high),l=n(row.low),c=n(row.close),v=n(row.volume);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||![o,h,l,c].every(Number.isFinite))continue;
      if(o<=0||c<=0||l<=0||h<Math.max(o,c,l)||l>Math.min(o,c,h))continue;
      byDate.set(date,{time:date,open:o,high:h,low:l,close:c,volume:Number.isFinite(v)&&v>=0?v:null});
    }
    return [...byDate.values()].sort((a,b)=>a.time.localeCompare(b.time));
  }
  function sma(bars,days){
    if(bars.length<days)return null;
    return round(avg(bars.slice(-days).map(x=>x.close)));
  }
  function rsi(closes,period=14){
    if(closes.length<=period)return null;
    let gains=0,losses=0;
    for(let i=closes.length-period;i<closes.length;i++){
      const delta=closes[i]-closes[i-1];
      if(delta>0)gains+=delta;else losses-=delta;
    }
    if(losses===0)return gains===0?50:100;
    const rs=gains/losses;
    return round(100-100/(1+rs));
  }
  function atr(bars,period=14){
    if(bars.length<=period)return null;
    const trs=[];
    for(let i=bars.length-period;i<bars.length;i++){
      const b=bars[i],p=bars[i-1];
      trs.push(Math.max(b.high-b.low,Math.abs(b.high-p.close),Math.abs(b.low-p.close)));
    }
    return round(avg(trs));
  }
  function metrics(bars){
    const b=bars.at(-1);
    if(!b)return {};
    const closes=bars.map(x=>x.close);
    const ret=days=>closes.length>days?round((b.close/closes.at(-(days+1))-1)*100):null;
    const prior=bars.at(-2);
    const vols=bars.slice(-21,-1).map(x=>x.volume);
    const rv=vols.length===20&&vols.every(Number.isFinite)&&Number.isFinite(b.volume)&&avg(vols)>0
      ?round(b.volume/avg(vols)):null;
    const last20=bars.slice(-20);
    const high20=last20.length===20?Math.max(...last20.map(x=>x.high)):null;
    const s5=sma(bars,5),s20=sma(bars,20);
    return {
      return1dPct:ret(1),return5dPct:ret(5),return20dPct:ret(20),
      sma5:s5,sma20:s20,rsi14:rsi(closes),atr14:atr(bars),
      relativeVolume20:rv,high20,
      distanceTo20dHighPct:high20?round((b.close/high20-1)*100):null,
      aboveSma5:s5!==null?b.close>=s5:null,
      aboveSma20:s20!==null?b.close>=s20:null,
      changePct:prior?round((b.close/prior.close-1)*100):null
    };
  }
  function verifiedCatalysts(items,asOf){
    return (Array.isArray(items)?items:[]).filter(x=>
      x&&x.verified===true&&
      ["earnings","upward_revision","dividend_increase","buyback","major_contract","other_official"].includes(x.type)&&
      typeof x.headline==="string"&&x.headline.trim().length>=4&&
      /^https:\/\//.test(String(x.url||""))&&
      Number.isFinite(Date.parse(x.publishedAt))&&Date.parse(x.publishedAt)<=Date.parse(asOf)
    ).slice(0,5);
  }
  function sourceStatus(source,asOf){
    if(!source||typeof source!=="object")return "UNAVAILABLE";
    if(source.status==="DEMO")return "DEMO";
    if(source.status==="STALE")return "STALE";
    if(!["DAILY","RECENT","MANUAL"].includes(source.status))return "UNAVAILABLE";
    const day=datePart(source.asOf);
    return ageDays(day,asOf)<=MAX_CALENDAR_AGE_DAYS?"DAILY":"STALE";
  }
  function scoreOf(m,catalysts,market){
    const components={
      catalyst:0,momentum:0,volume:0,relativeStrength:0,orderFlow:0,marketRegime:0
    };
    if(catalysts.length)components.catalyst=clamp(catalysts.reduce((s,c)=>s+(
      c.type==="upward_revision"||c.type==="buyback"||c.type==="earnings"?10:6
    ),0),0,30);
    if(m.return5dPct!==null&&m.return5dPct!==undefined)components.momentum=clamp(Math.round(10+m.return5dPct*2),0,20);
    if(m.aboveSma20===true)components.momentum=clamp(components.momentum+4,0,20);
    if(m.relativeVolume20!==null&&m.relativeVolume20!==undefined)
      components.volume=clamp(Math.round(m.relativeVolume20*6),0,15);
    // Relative-strength score requires a VERIFIED comparison benchmark, never guessed.
    const relative=Number(m.relativeStrengthPct);
    if(m.relativeStrengthPct!==undefined&&Number.isFinite(relative))components.relativeStrength=clamp(Math.round(7.5+relative),0,15);
    // Order flow needs actual board/transaction information, never inferred from daily candles.
    components.orderFlow=0;
    components.marketRegime=market==="RISK_ON"?10:market==="NEUTRAL"?5:0;
    const sum=Object.values(components).reduce((a,b)=>a+b,0);
    // A score has no predictive probability interpretation.
    return {components,rawScore:sum,score:clamp(Math.round(sum*100/100),0,100)};
  }
  function analyzeCandidate(raw,market,asOf){
    const code=String(raw?.code||"").trim();
    if(!/^\d{4,5}$/.test(code))return null;
    const candles=barsOf(raw.candles).filter(bar=>bar.time<=tokyoDate(asOf));
    const m=metrics(candles);
    const latest=candles.at(-1);
    const freshness=latest&&ageDays(latest.time,asOf)<=MAX_CALENDAR_AGE_DAYS?"DAILY":"STALE";
    const viable=candles.length>=MIN_BARS && freshness==="DAILY";
    const catalysts=verifiedCatalysts(raw.catalysts,asOf);
    const s=scoreOf(m,catalysts,market);
    const liquid=Number.isFinite(latest?.volume)&&latest.volume>0&&Number.isFinite(latest?.close);
    const volumeAverage=candles.slice(-20).map(x=>x.volume);
    const liquidityOK=liquid&&volumeAverage.length===20&&volumeAverage.every(Number.isFinite)
      && avg(volumeAverage.map((v,i)=>v*candles.at(-(20-i)).close))>=30000000;
    const reasons=[],risks=[];
    if(catalysts.length)reasons.push("確認済み材料："+catalysts[0].headline);
    else risks.push("確認済みの企業材料なし");
    if(m.aboveSma20===true)reasons.push("終値が20日移動平均より上");
    else risks.push("終値が20日移動平均を上回らないか未確認");
    if(Number.isFinite(m.relativeVolume20)&&m.relativeVolume20>=1.5)reasons.push("出来高が20日平均の"+m.relativeVolume20+"倍");
    if(Number.isFinite(m.rsi14)&&m.rsi14>=75)risks.push("RSI過熱："+m.rsi14);
    if(!liquidityOK)risks.push("売買代金または流動性が不足/不明");
    if(!viable)risks.push("必要な最新25営業日の日足が不足、またはデータが古い");
    if(market==="RISK_OFF"||market==="UNKNOWN")risks.push("市場環境が弱い、または未確認");
    if(!catalysts.length)risks.push("適時開示等の好材料を確認できていない");
    risks.push("寄り付きGU、気配・VWAP・板は未確認");

    const score=s.score;
    const canWatch=viable&&liquidityOK&&market!=="RISK_OFF";
    const rank=!canWatch?"NO TRADE":score>=80?"S":score>=70?"A":score>=60?"B":score>=50?"C":"NO TRADE";
    const tradeScore=canWatch?Math.min(score,59):0; // No live quote or intraday validation.
    const decision=!canWatch?"見送り":"監視のみ・寄り後の確認待ち";
    return {
      code,name:String(raw.name||code),exchange:"TSE",
      price:latest?.close??null,changePct:m.changePct??null,
      candles:viable?candles.slice(-100):[],marketMetrics:m,components:s.components,
      predictionScore:score,tradeScore,
      rank,freshness:viable?"DAILY":"STALE",
      dataUpdatedAt:latest?latest.time+"T15:30:00+09:00":null,
      catalyst:catalysts.length?catalysts[0].headline:"確認済み材料なし",
      whyBuy:reasons.length?reasons:["客観的な買い材料を十分に確認できていません"],
      whyNotBuy:risks,entryCondition:"現在値・板・寄り後のVWAPと出来高を確認するまで新規エントリーしない。",
      invalidation:"大幅GU、流動性不足、終値の20日線割れ、地合い悪化なら見送り。",
      targetLogic:"損切り位置と想定リスクリワードを証券アプリの現在値で再計算。",
      decision,analysisState:viable?"RESEARCH_ONLY":"INSUFFICIENT_DATA",
      evidence:catalysts.map(x=>({type:x.type,url:x.url,publishedAt:x.publishedAt})),
      liquidityOK
    };
  }
  function analyze(input,options={}){
    if(!input||typeof input!=="object")throw new Error("Input must be an object");
    const asOf=options.now||input.asOf||new Date().toISOString();
    if(!Number.isFinite(Date.parse(asOf)))throw new Error("Invalid asOf");
    const market=allowedRegimes.has(input.market?.status)&&input.market?.verified===true?input.market.status:"UNKNOWN";
    const isPublic=Boolean(options.publicOutput);
    const redistributable=input.source?.redistributionPermitted===true&&
      /^https:\/\//.test(String(input.source?.licenseUrl||""));
    if(isPublic&&!redistributable)throw new Error("PUBLICATION_DENIED: explicit redistribution rights and licenseURL required");
    const sourceFreshness=sourceStatus(input.source,asOf);
    const candidateResults=(Array.isArray(input.candidates)?input.candidates:[])
      .slice(0,200).map(x=>analyzeCandidate(x,market,asOf)).filter(Boolean)
      .sort((a,b)=>b.predictionScore-a.predictionScore);
    const usable=candidateResults.filter(c=>c.analysisState==="RESEARCH_ONLY");
    const connected=sourceFreshness==="DAILY"&&usable.length>0;
    const status=connected?"DAILY":"UNAVAILABLE";
    const result={
      schemaVersion:1,
      meta:{
        product:"Stock man",mode:connected?"AUTO_DAILY":"UNAVAILABLE",
        snapshotType:"DETERMINISTIC_DAILY_ANALYSIS",
        engineVersion:VERSION,generatedAt:asOf,
        dataAsOf:input.source?.asOf||null,
        marketSession:"POST_CLOSE_RESEARCH",
        sourceStatus:sourceFreshness,
        nextReviewAt:null,
        disclaimer:"日足ベースの監視候補でありリアルタイムの買い推奨ではありません。寄り前市場情報・現在値・板・損失許容額の確認が必要です。",
        availabilityReason:connected?null:(!candidateResults.length?"入力データ未接続":sourceFreshness!=="DAILY"?"市場データが古い":"検証可能な最新日足が不足")
      },
      marketRegime:{
        status:market,score:market==="RISK_ON"?70:market==="NEUTRAL"?50:market==="RISK_OFF"?25:null,
        confidence:input.market?.verified===true?"MEDIUM":"LOW",
        note:input.market?.verified===true?String(input.market.note||"確認済み市場状況"):"市場環境は未確認。単独で売買判断しない。",
        indicators:[]
      },
      dataSources:[
        {label:"株価",status, note:input.source?.provider||"未接続"},
        {label:"ローソク足",status,note:"日足・場中ではない"},
        {label:"決算・適時開示",status:input.disclosuresVerified===true?"RECENT":"UNAVAILABLE",note:"検証済みURLのみ採用"},
        {label:"PTS",status:"UNAVAILABLE",note:"自動取得元なし"},
        {label:"米国市場",status:"UNAVAILABLE",note:"自動取得元なし"},
        {label:"日経先物",status:"UNAVAILABLE",note:"自動取得元なし"},
        {label:"為替",status:"UNAVAILABLE",note:"自動取得元なし"}
      ],
      candidates:connected?candidateResults:[]
    };
    return result;
  }
  function unavailable(reason,at){
    const timestamp=at||new Date().toISOString();
    return analyze({asOf:timestamp,source:{status:"UNAVAILABLE"},candidates:[],market:{status:"UNKNOWN"}},{now:timestamp});
  }
  return Object.freeze({VERSION,MIN_BARS,WEIGHTS,barsOf,metrics,analyze,unavailable,sourceStatus,ageDays});
});
