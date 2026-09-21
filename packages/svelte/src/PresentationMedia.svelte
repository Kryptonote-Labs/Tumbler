<script lang="ts">
 import type {SlideObject} from '@tumblerjs/slides';
 let {media,poster,active=true}:{media:NonNullable<SlideObject['media']>;poster?:string;active?:boolean}=$props();
 let url=$state(''),allowed=$state(false),failed=$state(false),player=$state<HTMLMediaElement>();
 $effect(()=>{if(!media.bytes){url='';return;}const next=URL.createObjectURL(new Blob([Uint8Array.from(media.bytes).buffer],{type:media.contentType}));url=next;return()=>URL.revokeObjectURL(next);});
 let source=$derived(url || (allowed?media.url:undefined));
 function loaded(){if(player && media.start)player.currentTime=media.start;}
 function update(){if(player && media.end!==undefined && player.currentTime>=media.end)player.pause();}
 $effect(()=>{if(!active)player?.pause();});
</script>
<!-- Keep playback controls from starting object drags or slide keyboard navigation. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="media" onpointerdown={e=>e.stopPropagation()} onkeydown={e=>e.stopPropagation()} role="group" aria-label={`${media.kind} playback`}>
 {#if !source && media.url}<button onclick={()=>allowed=true}>Load linked {media.kind}</button>
 {:else if failed}<span>This browser cannot play this {media.kind}.</span>
 {:else if media.kind==='video'}
 <!-- Captions can be added when the source document provides a caption track. -->
 <!-- svelte-ignore a11y_media_has_caption -->
 <video bind:this={player} src={source} {poster} controls preload="metadata" onloadedmetadata={loaded} ontimeupdate={update} onerror={()=>failed=true}></video>
 {:else}<audio bind:this={player} src={source} controls preload="metadata" onloadedmetadata={loaded} ontimeupdate={update} onerror={()=>failed=true}></audio>{/if}
</div>
<style>.media{width:100%;height:100%;display:grid;place-items:center;background:#eee;color:#222;font:14px Arial}video{width:100%;height:100%;object-fit:contain}audio{max-width:100%}button{font:inherit}</style>
