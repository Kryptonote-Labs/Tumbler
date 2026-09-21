<script lang="ts">
 import type {SlideObject} from '@tumblerjs/slides';
 let {object,id}:{object:SlideObject;id:string}=$props();
</script>
<filter {id} x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB">
 {#each object.effects??[] as effect,i}
  {@const input=i ? `effect${i-1}` : "SourceGraphic"}
  {#if effect.kind==='glow'}<feGaussianBlur in="SourceAlpha" stdDeviation={effect.radius} result={`blur${i}`}/><feFlood flood-color={effect.color}/><feComposite in2={`blur${i}`} operator="in"/><feMerge result={`effect${i}`}><feMergeNode/><feMergeNode in={input}/></feMerge>
  {:else if effect.kind==='innerShadow'}<feOffset in="SourceAlpha" dx={effect.x} dy={effect.y}/><feGaussianBlur stdDeviation={effect.radius} result={`shadowBlur${i}`}/><feComposite in="SourceAlpha" in2={`shadowBlur${i}`} operator="out" result={`hole${i}`}/><feFlood flood-color={effect.color}/><feComposite in2={`hole${i}`} operator="in"/><feComposite in2={input} operator="atop" result={`effect${i}`}/>
  {:else if effect.kind==='softEdge'}<feMorphology in="SourceAlpha" operator="erode" radius={effect.radius}/><feGaussianBlur stdDeviation={effect.radius} result={`soft${i}`}/><feComposite in={input} in2={`soft${i}`} operator="in" result={`effect${i}`}/>
  {:else}<feGaussianBlur in={input} stdDeviation={effect.radius} result={`effect${i}`}/>{/if}
 {/each}
 {#if object.shadow}<feDropShadow dx={object.shadow.x} dy={object.shadow.y} stdDeviation={object.shadow.blur} flood-color={object.shadow.color}/>{/if}
</filter>
