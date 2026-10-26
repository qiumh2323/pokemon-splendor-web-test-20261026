import createEngine from './engine.js?v=4';
import {encode,tieRanks} from './encoder.js';
import * as ort from './vendor/ort.wasm.min.mjs';
let engine,data,session,ready;
let currentRequestId=null;
globalThis.onSearchProgress=(completed,total)=>postMessage({type:'search-progress',id:currentRequestId,completed,total});
ort.env.wasm.numThreads=1;
ort.env.wasm.wasmPaths=new URL('./vendor/',import.meta.url).href;
globalThis.evaluateNative=async packet=>{
 const enc=encode(packet,data);
 const result=await session.run({global:new ort.Tensor('float32',Float32Array.from(enc.global),[enc.global.length]),
   entities:new ort.Tensor('float32',Float32Array.from(enc.entities.flat()),[enc.entities.length,enc.entities[0].length]),
   actions:new ort.Tensor('float32',Float32Array.from(enc.actions.flat()),[enc.actions.length,enc.actions[0].length])});
 const logits=Array.from(result.logits.data),max=Math.max(...logits),exp=logits.map(x=>Math.exp(x-max)),sum=exp.reduce((a,b)=>a+b,0);
 const value=result.value.data[0];Object.values(result).forEach(t=>t.dispose());
 return {priors:exp.map(x=>x/sum),value,...tieRanks(packet.actions,data)};
};
async function dispatch(req){
 const text=await engine.ccall('web_dispatch','string',['string'],[JSON.stringify(req)],{async:true});
 const result=JSON.parse(text);if(result.error)throw Error(result.error);return result;
}
async function initialize(){
 postMessage({type:'loading',message:'下载冠军与本地计算引擎…'});
 data=await fetch('./catalog.json').then(r=>r.json());
 postMessage({type:'loading',message:'正在准备本地搜索引擎…'});
 engine=await createEngine({locateFile:name=>new URL(name+'?v=4',import.meta.url).href});
 postMessage({type:'loading',message:'正在加载冠军模型，首次打开需要下载…'});
 session=await ort.InferenceSession.create('./champion.onnx',{executionProviders:['wasm'],graphOptimizationLevel:'all'});
 await dispatch({op:'init',data});
 postMessage({type:'ready',data:{version:data.version,cards:data.cards.map(({features,entity,...c})=>c)}});
}
ready=initialize();
self.onmessage=async ({data:req})=>{
 try{await ready;currentRequestId=req.id;const t=performance.now();const result=await dispatch(req);
   postMessage({type:'result',id:req.id,result,elapsed:performance.now()-t});
 }catch(e){postMessage({type:'error',id:req.id,message:e.message});}
};
ready.catch(e=>postMessage({type:'error',message:e.message}));
