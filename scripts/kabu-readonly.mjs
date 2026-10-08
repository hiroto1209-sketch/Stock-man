#!/usr/bin/env node
/**
 * PRIVATE read-only kabuステーション API collector.
 * Runs only on the same Windows PC as kabuステーション.
 * Never calls /sendorder or pushes market data to GitHub.
 * Requires Professional or Premium API eligibility.
 *
 * PowerShell:
 *   $env:KABU_API_PASSWORD="YOUR_API_PASSWORD"
 *   node scripts/kabu-readonly.mjs 3723 2670 6814
 */
import fs from "node:fs";
import path from "node:path";

const API="http://localhost:18080/kabusapi";
const OUT=path.resolve(process.env.STOCKMAN_PRIVATE_OUTPUT || "private/market-input.json");
const password=String(process.env.KABU_API_PASSWORD||"");
const symbols=[...new Set(process.argv.slice(2).filter(x=>/^\d{4,5}$/.test(x)))].slice(0,20);

function jstDay(ts){
  return new Intl.DateTimeFormat("en-CA",{
    timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"
  }).format(new Date(ts));
}
function jstHourMin(ts){
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date(ts));
  return Number(parts.find(x=>x.type==="hour")?.value)*60+Number(parts.find(x=>x.type==="minute")?.value);
}
function number(value){
  if(value===null||value===undefined||value==="")return NaN;
  return Number(value);
}
async function json(url,opts){
  const response=await fetch(url,{...opts,signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error("kabuステーション応答エラー: "+response.status);
  return response.json();
}
function safeDayBoard(row,today){
  const checkedAt=String(row.CurrentPriceTime||"");
  if(jstDay(checkedAt)!==today)throw new Error("現在値の時刻が今日ではありません");
  const open=number(row.OpeningPrice),high=number(row.HighPrice);
  const low=number(row.LowPrice),close=number(row.CurrentPrice);
  const volume=number(row.TradingVolume);
  if(![open,high,low,close,volume].every(Number.isFinite))throw new Error("始値/高値/安値/終値/出来高が不足");
  if(low<=0||open<=0||close<=0||high<Math.max(open,close,low)||low>Math.min(open,close,high)||volume<=0){
    throw new Error("不正なOHLCV");
  }
  return {time:today,open,high,low,close,volume};
}

async function main(){
  if(!password)throw new Error("KABU_API_PASSWORD が未設定です。パスワードをGitHubへ登録しないでください。");
  if(!symbols.length)throw new Error("銘柄コードを指定してください。例: 3723 2670");
  const now=new Date(),today=jstDay(now.toISOString());
  if(jstHourMin(now.toISOString())<15*60+35)throw new Error("15:35 JST以降の大引け後に実行してください。");
  const auth=await json(API+"/token",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({APIPassword:password})
  });
  const token=String(auth.Token||"");
  if(!token)throw new Error("kabuステーションAPIトークンが取得できませんでした。");
  let input={
    schemaVersion:1,asOf:now.toISOString(),
    source:{status:"DAILY",provider:"kabu Station API — PERSONAL ONLY",
      asOf:now.toISOString(),redistributionPermitted:false},
    market:{status:"UNKNOWN",verified:false,note:"市場全体の判断データは未接続"},
    disclosuresVerified:false,candidates:[]
  };
  if(fs.existsSync(OUT)){
    try{
      const existing=JSON.parse(fs.readFileSync(OUT,"utf8"));
      if(Array.isArray(existing.candidates))input.candidates=existing.candidates;
    }catch{throw new Error("既存のprivate-market-input.jsonが破損しています。上書きせず終了します。");}
  }
  const byCode=new Map(input.candidates.map(x=>[x.code,x]));
  let imported=0;
  for(const code of symbols){
    try{
      const board=await json(API+"/board/"+encodeURIComponent(code)+"@1",{
        method:"GET",headers:{"X-API-KEY":token}
      });
      const candle=safeDayBoard(board,today);
      const old=byCode.get(code)||{code,name:String(board.SymbolName||code),candles:[],catalysts:[]};
      const historical=Array.isArray(old.candles)?old.candles.filter(x=>String(x.time).slice(0,10)!==today):[];
      old.candles=[...historical,candle].sort((a,b)=>String(a.time).localeCompare(String(b.time))).slice(-180);
      old.name=String(board.SymbolName||old.name||code);
      byCode.set(code,old);
      imported++;
      console.log(code+" "+old.name+" "+today+" 日足記録OK (累計"+old.candles.length+"日)");
    }catch(error){
      console.warn(code+" を更新できませんでした: "+String(error.message||error));
    }
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!imported)throw new Error("日足を1件も取得できなかったため保存しません。");
  input.candidates=[...byCode.values()];
  input.asOf=now.toISOString();
  input.source.asOf=now.toISOString();
  fs.mkdirSync(path.dirname(OUT),{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(input,null,2)+"\n",{mode:0o600});
  console.log("個人専用ファイルに保存:",OUT);
  console.log("このデータは公開GitHubへcommitしないでください。");
}

main().catch(error=>{console.error(String(error.message||error));process.exitCode=1;});
