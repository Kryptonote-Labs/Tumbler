<script lang="ts">
 import {metafileSvg} from "./presentation-metafiles.ts";
 import type {SlideObject} from '@tumblerjs/slides';
 let {picture,id,width,height}:{picture:NonNullable<SlideObject['pictureFill']>;id:string;width:number;height:number}=$props();
 let url=$state(''),natural=$state({width:1,height:1});
 $effect(()=>{
   const current=picture;let disposed=false,src="";const image=new Image();
   const show=(blob:Blob)=>{if(disposed)return;src=URL.createObjectURL(blob);url=src;image.onload=()=>natural={width:image.naturalWidth,height:image.naturalHeight};image.src=src;};
   if(/(?:emf|wmf)$/.test(current.contentType))void metafileSvg(current.bytes,current.contentType).then(svg=>show(new Blob([svg],{type:"image/svg+xml"}))).catch(()=>{if(!disposed)url="";});
   else show(new Blob([Uint8Array.from(current.bytes).buffer],{type:current.contentType}));
   return()=>{disposed=true;image.onload=null;if(src)URL.revokeObjectURL(src);};
 });

 let tile=$derived(picture.tile);
 let w=$derived(tile?Math.max(1,natural.width*tile.scaleX):Math.max(1,width));
 let h=$derived(tile?Math.max(1,natural.height*tile.scaleY):Math.max(1,height));
 let flipX=$derived(tile?.flip==='x'||tile?.flip==='xy'),flipY=$derived(tile?.flip==='y'||tile?.flip==='xy');
 let crop=$derived(picture.crop),stretch=$derived(tile?[0,0,0,0]:picture.stretch??[0,0,0,0]);
 let dx=$derived(stretch[0]!*w),dy=$derived(stretch[1]!*h);
 let iw=$derived(w*(1-stretch[0]!-stretch[2]!)/(1-crop[0]-crop[2]));
 let ih=$derived(h*(1-stretch[1]!-stretch[3]!)/(1-crop[1]-crop[3]));
 let x=$derived((tile?.x??0)+(tile?.align.includes('r')?width-w:tile?.align==='ctr'||tile?.align==='t'||tile?.align==='b'?(width-w)/2:0));
 let y=$derived((tile?.y??0)+(tile?.align.includes('b')?height-h:tile?.align==='ctr'||tile?.align==='l'||tile?.align==='r'?(height-h)/2:0));
</script>
<pattern {id} patternUnits="userSpaceOnUse" {x} {y} width={w*(flipX?2:1)} height={h*(flipY?2:1)}>
 {#each Array.from({length:flipY?2:1}) as _,row}{#each Array.from({length:flipX?2:1}) as _,col}
 <g transform={`translate(${col?2*w:0} ${row?2*h:0}) scale(${col?-1:1} ${row?-1:1})`}>
 <svg width={w} height={h} overflow="hidden"><image href={url} x={dx-crop[0]*iw} y={dy-crop[1]*ih} width={iw} height={ih} preserveAspectRatio="none"/></svg>
 </g>{/each}{/each}
</pattern>
