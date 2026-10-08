#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const Engine=require("../engine/analysis-core.js");
const root=path.resolve(__dirname,"..");
const outFile=path.join(root,"data","daily-analysis.json");
const inputFile=process.env.STOCKMAN_INPUT_FILE
  ?path.resolve(process.env.STOCKMAN_INPUT_FILE)
  :path.join(root,"data","public-market-input.json");

async function loadInput(){
  const feed=process.env.STOCKMAN_PUBLIC_FEED_URL;
  if(feed){
    const url=new URL(feed);
    if(url.protocol!=="https:")throw new Error("Feed URL must be HTTPS");
    const headers={"Accept":"application/json"};
    if(process.env.STOCKMAN_PUBLIC_FEED_TOKEN)headers.Authorization="Bearer "+process.env.STOCKMAN_PUBLIC_FEED_TOKEN;
    const response=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error("Feed HTTP "+response.status);
    return response.json();
  }
  if(fs.existsSync(inputFile))return JSON.parse(fs.readFileSync(inputFile,"utf8"));
  return null;
}

async function main(){
  const timestamp=new Date().toISOString();
  let result;
  try{
    const source=await loadInput();
    if(!source)throw new Error("NO_LICENSED_PUBLIC_PROVIDER_CONFIGURED");
    result=Engine.analyze(source,{now:timestamp,publicOutput:true});
  }catch(error){
    result=Engine.unavailable(String(error.message||error),timestamp);
    result.meta.availabilityReason=String(error.message||error).slice(0,200);
  }
  fs.mkdirSync(path.dirname(outFile),{recursive:true});
  fs.writeFileSync(outFile,JSON.stringify(result,null,2)+"\n");
  // Immutable checkpoint archives are created only with licensed usable data.
  if(result.meta.mode==="AUTO_DAILY"&&result.candidates.length>0){
    const parts=new Intl.DateTimeFormat("en-GB",{
      timeZone:"Asia/Tokyo",hour:"2-digit",hour12:false
    }).formatToParts(new Date(timestamp));
    const hour=Number(parts.find(x=>x.type==="hour")?.value||0);
    const day=new Intl.DateTimeFormat("en-CA",{
      timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"
    }).format(new Date(timestamp));
    const checkpoint=hour<12?"PREMARKET":"POST_CLOSE";
    const dir=path.join(root,"data","history");
    const filename=path.join(dir,day+"-"+checkpoint+".json");
    fs.mkdirSync(dir,{recursive:true});
    if(!fs.existsSync(filename)){
      fs.writeFileSync(filename,JSON.stringify(result,null,2)+"\n",{flag:"wx"});
      console.log("Frozen licensed checkpoint:",day,checkpoint);
    }else{
      console.log("Checkpoint already exists; never overwriting:",day,checkpoint);
    }
  }
  process.stdout.write("Daily analysis: "+JSON.stringify({
    mode:result.meta.mode,asOf:result.meta.dataAsOf,
    generatedAt:result.meta.generatedAt,count:result.candidates.length,
    reason:result.meta.availabilityReason||"OK"
  })+"\n");
}
main().catch(error=>{console.error("Fatal analysis error:",String(error));process.exitCode=1;});
