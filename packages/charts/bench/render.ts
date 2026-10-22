import { parseOoxmlChart, layoutChartScene } from '../src/index.ts';
import { cpus } from 'node:os';
const encode = (points: string) => new TextEncoder().encode(`<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:val><c:numLit>${points}</c:numLit></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`);
console.log(JSON.stringify({bun:Bun.version,cpu:cpus()[0]?.model,warmups:2,samples:5,width:300,height:200}));
for (const n of [1000,5000,10000]) {
 const xml=encode(Array.from({length:n},(_,i)=>`<c:pt idx="${i}"><c:v>1</c:v></c:pt>`).join(''));
 const model=parseOoxmlChart(xml,'transitional'); if(model.status!=='supported')throw Error(model.reason);
 for(const [phase,run] of [['parse',()=>parseOoxmlChart(xml,'transitional')],['scene',()=>layoutChartScene(model,300,200)]] as const){
  for(let i=0;i<2;i++)run();
  const times:number[]=[]; const heaps:number[]=[];
  for(let i=0;i<5;i++){Bun.gc(true);const heap=process.memoryUsage().heapUsed; const start=performance.now();run();times.push(performance.now()-start);heaps.push(process.memoryUsage().heapUsed-heap);}
  console.log(JSON.stringify({n,phase,ms:times,heapDeltaBytes:heaps}));
 }
 const scene=layoutChartScene(model,300,200);console.log(JSON.stringify({n,marks:scene.marks.length,hash:Bun.hash(JSON.stringify(scene)).toString()}));
}
try { const hostile=parseOoxmlChart(encode('<c:pt idx="4294967295"><c:v>1</c:v></c:pt>'),'transitional');
console.log('hostile parse',hostile.status);if(hostile.status==='supported')try{layoutChartScene(hostile,300,200);console.log('hostile rendered');}catch(e){console.log('hostile render',String(e));}
} catch(e) { console.log('hostile parse rejected',String(e)); }
const simple=parseOoxmlChart(encode('<c:pt idx="0"><c:v>5</c:v></c:pt>'),'transitional');
if(simple.status==='supported')for(const grid of [false,true])console.log('grid',grid,layoutChartScene({...simple,axes:[{id:1,kind:'value',position:'left',majorGridlines:grid,deleted:false,title:undefined,minimum:undefined,maximum:undefined}]},300,200).marks.flatMap(m=>m.kind==='text'?[m.text]:[]));
