<script lang="ts">
  import { onMount, tick } from 'svelte';
  import * as Y from 'yjs';
  import { PdfInterpreter, PdfTextModel, PdfEditingFonts, layoutPdfTextFlow, pdfContinuationHeight, hitPdfText, pdfSourceKey, browserPdfPaintHost, paintPdfPage, defaultPdfTextStyle, pdfFontKey, type PdfDocument, type PdfTextStyle, type PdfTextLayout } from '@tumblerjs/pdf';
  type Selection = { region: string; anchor: number[]; head: number[] };
  let { document: pdf, model, fonts, scale = 4/3, editable = true, adding = false, peers = [], onselection, onadded, onpagechange, onpages, onstyle }: {
    document: PdfDocument; model: PdfTextModel; fonts: PdfEditingFonts; scale?: number; editable?: boolean; adding?: boolean;
    peers?: { id: string; name: string; color: string; selection?: Selection | null }[];
    onselection?: (selection: Selection | null) => void; onadded?: () => void; onpagechange?: (index: number) => void; onpages?: (count:number)=>void; onstyle?: (style:PdfTextStyle)=>void;
  } = $props();
  let revision = $state(0), active = $state<string>(), start = $state(0), end = $state(0), pending = $state<Partial<PdfTextStyle>>({});
  let input: HTMLTextAreaElement, root: HTMLDivElement;
  let value = $state(''), composing = false, dragging: { id: string; anchor: number; page:number } | undefined;
  const interpreter = $derived(new PdfInterpreter(pdf));
  const flow=$derived.by(()=>{void revision;return layoutPdfTextFlow(model,fonts,pdf.pages);});
  const layouts=$derived(flow.regions);
  $effect(()=>onpages?.(flow.pages.length));
  let anchors: { first: ReturnType<PdfTextModel['anchor']>; last: ReturnType<PdfTextModel['anchor']> } | undefined;
  const currentStyle = $derived.by(() => { void revision; return active ? { ...model.styleAt(active,start), ...pending } : defaultPdfTextStyle; });
  $effect(()=>onstyle?.(currentStyle));
  export function format(patch: Partial<PdfTextStyle>) {
    if (!editable || !active) return;
    model.undo.stopCapturing();
    if (start !== end) model.format(active,start,end,patch); else pending = { ...pending,...patch };
    input?.focus({preventScroll:true});
  }
  export function toggle(key: 'bold' | 'italic' | 'underline') { format({[key]:!currentStyle[key]}); }
  export function undo(redo = false) { if (editable) { if (redo) model.undo.redo(); else model.undo.undo(); } }
  export function goToPage(index: number) { root.querySelector(`[data-pdf-page="${index+1}"]`)?.scrollIntoView({block:'start'}); }
  function publish() {
    if (!active || !input) return;
    start=input.selectionStart; end=input.selectionEnd;
    anchors = { first:model.anchor(active,start),last:model.anchor(active,end) };
    onselection?.({region:active,anchor:[...Y.encodeRelativePosition(Y.createRelativePositionFromJSON(anchors.first))],head:[...Y.encodeRelativePosition(Y.createRelativePositionFromJSON(anchors.last))]});
  }
  async function select(id: string, first: number, last = first) {
    active=id; start=Math.min(first,last);end=Math.max(first,last);pending={}; value=model.text(id).toString();
    await tick(); input.focus({preventScroll:true}); input.setSelectionRange(start,end,first > last ? 'backward' : 'forward'); publish();
  }
  function changed() {
    if (!active || composing) return;
    const text=model.text(active).toString(), next=input.value;
    let first=0; while(first<text.length && first<next.length && text[first]===next[first]) first++;
    // A UTF-16 prefix must never split a surrogate pair.
    if (first>0 && /[\ud800-\udbff]/.test(text[first-1]!)) first--;
    let tail=0; while(tail<text.length-first && tail<next.length-first && text[text.length-tail-1]===next[next.length-tail-1]) tail++;
    const selection=[input.selectionStart,input.selectionEnd];
    model.replace(active,first,text.length-tail,next.slice(first,next.length-tail),{...model.styleAt(active,first),...pending});
    value=next; input.value=next; input.setSelectionRange(selection[0]!,selection[1]!);publish();
  }
  function key(event: KeyboardEvent) {
    if (!active) return;
    const mod=event.metaKey||event.ctrlKey;
    if (mod && ['b','i','u'].includes(event.key.toLowerCase())) { event.preventDefault();toggle(({b:'bold',i:'italic',u:'underline'} as const)[event.key.toLowerCase() as 'b'|'i'|'u']); }
    if (mod && event.key.toLowerCase()==='z') { event.preventDefault();undo(event.shiftKey); }
    if (event.key === 'Home' || event.key === 'End') {
      const layout=layouts.find(l=>l.id===active&&l.carets.some(c=>c.offset===(input.selectionDirection==='backward'?start:end))),offset=input.selectionDirection==='backward'?start:end,caret=layout?.carets.find(c=>c.offset===offset);
      if(layout&&caret){event.preventDefault();const line=layout.carets.filter(c=>Math.abs(c.y-caret.y)<.1),next=mod?(event.key==='Home'?0:model.text(layout.id).length):(event.key==='Home'?line[0]!.offset:line.at(-1)!.offset);void select(layout.id,event.shiftKey?(input.selectionDirection==='backward'?end:start):next,next);}
    }
    if (event.key==='Escape') {active=undefined;onselection?.(null);}
    if (['ArrowUp','ArrowDown'].includes(event.key)) {
      const layout=layouts.find(l=>l.id===active&&l.carets.some(c=>c.offset===(input.selectionDirection==='backward'?start:end))), caret=layout?.carets.find(c=>c.offset===(input.selectionDirection==='backward'?start:end));
      if(layout&&caret) {event.preventDefault();const next=hitPdfText(layout,caret.x,caret.y+(event.key==='ArrowUp'?-1:1)*Math.max(model.seed(layout.id).lineHeight,caret.height*1.25));const anchor=event.shiftKey?(input.selectionDirection==='backward'?end:start):next.offset;void select(layout.id,anchor,next.offset);}
    }
  }
  function pointer(event: PointerEvent, page: number) {
    if (!editable || event.button !== 0) return;
    const host=event.currentTarget as HTMLElement, rect=host.getBoundingClientRect(), x=(event.clientX-rect.left)/scale,y=(event.clientY-rect.top)/scale;
    onpagechange?.(page);
    if (adding) {
      const targetPage=flow.pages[page]!,id=crypto.randomUUID(); model.add({id,page:targetPage.source.index,x,y:y+targetPage.continuation*pdfContinuationHeight(targetPage.source),width:Math.max(24,targetPage.source.width-x-24),lineHeight:15,style:{...defaultPdfTextStyle},sources:[],delta:[]});
      void select(id,0);onadded?.();event.preventDefault();return;
    }
    const candidates=layouts.filter(l=>l.page===page);
    const layout=candidates.filter(l=>{const s=model.seed(l.id);return x>=s.x-4&&x<=s.x+s.width+4&&y>=l.top&&y<=l.bottom;}).sort((a,b)=>Math.min(...a.carets.map(c=>Math.abs(c.y-y)))-Math.min(...b.carets.map(c=>Math.abs(c.y-y))))[0];
    if (!layout) { active=undefined;onselection?.(null);return; }
    const offset=hitPdfText(layout,x,y).offset;dragging={id:layout.id,anchor:offset,page}; host.setPointerCapture(event.pointerId);event.preventDefault();void select(layout.id,offset);
  }
  function move(event: PointerEvent) {
    if(!dragging)return;
    const host=event.currentTarget as HTMLElement,rect=host.getBoundingClientRect(),layout=layouts.find(l=>l.id===dragging!.id&&l.page===dragging!.page);
    if(layout)void select(layout.id,dragging.anchor,hitPdfText(layout,(event.clientX-rect.left)/scale,(event.clientY-rect.top)/scale).offset);
  }
  function double(event: MouseEvent, page: number) {
    if(!active||!layouts.some(l=>l.id===active&&l.page===page))return;
    const text=model.text(active).toString(), segments=new Intl.Segmenter(undefined,{granularity:'word'});
    for(const segment of segments.segment(text))if(start>=segment.index&&start<=segment.index+segment.segment.length){void select(active,segment.index,segment.index+segment.segment.length);break;}
    event.preventDefault();
  }
  function paint(canvas: HTMLCanvasElement, options: {index:number;scale:number;source:number;continuation:number}) {
    let page=options.source,continuation=options.continuation;
    let visible=false;
    let disposed=false,controller:AbortController|undefined;
    const render=()=>{
      controller?.abort();if(!visible){canvas.width=0;canvas.height=0;interpreter.releasePage(page);return;}controller=new AbortController(); const signal=controller.signal;
      const scene=interpreter.page(page), currentFlow=layoutPdfTextFlow(model,fonts,pdf.pages), hidden=new Set(currentFlow.regions.filter(region=>region.render&&model.seed(region.id).page===page).flatMap(region=>model.seed(region.id).sources.map(s=>`${s.instance}/${s.object}/${s.start}`)));
      const projected={...scene,elements:continuation?[]:scene.elements.filter(e=>!hidden.has(pdfSourceKey(e.source)))};
      const host=browserPdfPaintHost(),ratio=window.devicePixelRatio||1,staging=window.document.createElement('canvas');
      staging.width=Math.ceil(scene.width*scale*ratio);staging.height=Math.ceil(scene.height*scale*ratio);
      void paintPdfPage(staging.getContext('2d')!,projected,pdf.source,host,{scale:scale*ratio,signal}).then(()=>{if(disposed||signal.aborted)return;canvas.width=staging.width;canvas.height=staging.height;canvas.getContext('2d')!.drawImage(staging,0,0);}).catch(error=>{if(!signal.aborted)console.error(error);}).finally(()=>host.close());
    };
    const observer=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);render();},{rootMargin:'600px 0px'});observer.observe(canvas);
    model.doc.on('afterTransaction',render);
    return {update(value: {index:number;scale:number;source:number;continuation:number}){page=value.source;continuation=value.continuation;render();},destroy(){disposed=true;observer.disconnect();controller?.abort();model.doc.off('afterTransaction',render);}};
  }
  function peerRange(peer: typeof peers[number], layout: PdfTextLayout) {
    try {if(!peer.selection||peer.selection.region!==layout.id)return;const resolve=(data:number[])=>Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(new Uint8Array(data)),model.doc);const a=resolve(peer.selection.anchor),b=resolve(peer.selection.head);if(!a||!b)return;return {start:Math.min(a.index,b.index),end:Math.max(a.index,b.index),caret:layout.carets.find(c=>c.offset===b.index)};}catch{return;}
  }
  $effect(()=>{void active;void start;void end;void revision;void tick().then(()=>root?.querySelector('.local')?.scrollIntoView({block:'nearest',inline:'nearest'}));});
  onMount(()=>{
    const before=()=>{if(active&&input&&window.document.activeElement===input){anchors={first:model.anchor(active,input.selectionStart),last:model.anchor(active,input.selectionEnd)};}};
    const after=()=>{revision++;if(active&&!model.regions.has(active)){active=undefined;value='';onselection?.(null);return;}if(active&&!composing){const first=anchors&&model.resolve(anchors.first),last=anchors&&model.resolve(anchors.last);value=model.text(active).toString();input.value=value;if(first&&last){start=first.offset;end=last.offset;input.setSelectionRange(start,end);}}};
    model.doc.on('beforeTransaction',before);model.doc.on('afterTransaction',after);
    return()=>{model.doc.off('beforeTransaction',before);model.doc.off('afterTransaction',after);onselection?.(null);};
  });
</script>
<div class="pdf-editable" bind:this={root}>
  {#each flow.pages as page}
    <div class="pdf-page" data-pdf-page={page.index+1} style:width={`${page.source.width*scale}px`} style:height={`${page.source.height*scale}px`} onpointerdown={e=>pointer(e,page.index)} onpointermove={move} onpointerup={()=>dragging=undefined} onpointercancel={()=>dragging=undefined} ondblclick={e=>double(e,page.index)} role="group" aria-label="PDF page">
      <canvas use:paint={{index:page.index,scale,source:page.source.index,continuation:page.continuation}} aria-label={`Page ${page.index+1}`} style:width="100%" style:height="100%"></canvas>
      <div class="text-layer" style:transform={`scale(${scale})`}>
        {#each layouts.filter(l=>l.page===page.index) as layout (layout.id+':'+layout.page)}
          {@const dirty=layout.render}
          {#each layout.glyphs as glyph}
            {#if glyph.text!=='\n'}<svg class="glyph" aria-hidden="true" width={Math.max(1,glyph.width+glyph.style.size)} height={glyph.style.size*2} style:left={`${glyph.x}px`} style:top={`${glyph.y-glyph.style.size}px`} style:overflow="visible"><text x="0" y={glyph.style.size} font-family={`PDF-${pdfFontKey(glyph.style)}`} font-size={glyph.style.size} fill={dirty?glyph.style.color:'transparent'} text-decoration={glyph.style.underline?'underline':'none'}>{glyph.text}</text></svg>{/if}
            {#if active===layout.id&&glyph.end>start&&glyph.start<end}<span class="selection" style:left={`${glyph.x}px`} style:top={`${glyph.y-glyph.style.size*.85}px`} style:width={`${Math.max(1,glyph.width)}px`} style:height={`${glyph.style.size*1.15}px`}></span>{/if}
          {/each}
          {#if active===layout.id&&start===end}
            {@const caret=layout.carets.find(c=>c.offset===start)}
            {#if caret}<span class="caret local" style:left={`${caret.x}px`} style:top={`${caret.y-caret.height*.85}px`} style:height={`${caret.height*1.15}px`}></span>{/if}
          {/if}
          {#each peers as peer (peer.id)}
            {@const range=peerRange(peer,layout)}
            {#if range}
              {#each layout.glyphs.filter(g=>g.end>range.start&&g.start<range.end) as glyph}<span class="selection" style:background={peer.color} style:left={`${glyph.x}px`} style:top={`${glyph.y-glyph.style.size*.85}px`} style:width={`${Math.max(1,glyph.width)}px`} style:height={`${glyph.style.size*1.15}px`}></span>{/each}
              {#if range.caret}<span class="caret remote" style:--peer-color={peer.color} style:left={`${range.caret.x}px`} style:top={`${range.caret.y-range.caret.height*.85}px`} style:height={`${range.caret.height*1.15}px`}><span>{peer.name}</span></span>{/if}
            {/if}
          {/each}
        {/each}
      </div>
    </div>
  {/each}
  <textarea wrap="off" bind:this={input} aria-label="Edit PDF text" disabled={!editable} value={value} oninput={changed} onselect={publish} onkeyup={publish} onkeydown={key} oncompositionstart={()=>composing=true} oncompositionend={()=>{composing=false;changed();}} onblur={()=>onselection?.(null)} spellcheck="false" style:left={`${(active?layouts.find(l=>l.id===active)?.carets.find(c=>c.offset===start)?.x:0)??0}px`}></textarea>
</div>
<style>
  .pdf-editable{position:relative;display:flex;flex-direction:column;align-items:center;gap:20px;padding:24px;min-width:min-content;}
  .pdf-page{position:relative;flex:none;background:white;box-shadow:0 1px 5px #0005;color-scheme:light;touch-action:none;cursor:text;}
  canvas{display:block;pointer-events:none;}
  .text-layer{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;}
  .glyph{position:absolute;white-space:pre;line-height:1;user-select:none;}
  .selection{position:absolute;background:#3684df;opacity:.23;pointer-events:none;}
  .caret{position:absolute;border-left:1.5px solid #111;pointer-events:none;}
  .remote{border-color:var(--peer-color);}
  .remote>span{position:absolute;bottom:100%;left:-1.5px;background:var(--peer-color);color:white;font:10px/1.4 sans-serif;padding:2px 5px;border-radius:3px 3px 3px 0;white-space:nowrap;}
  textarea{position:fixed;bottom:0;width:1px;height:1px;opacity:.01;resize:none;padding:0;border:0;overflow:hidden;}
</style>
