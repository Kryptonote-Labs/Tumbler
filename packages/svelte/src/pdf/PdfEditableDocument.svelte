<script lang="ts">
  import { onMount, tick } from 'svelte';
  import * as Y from 'yjs';
  import { PdfInterpreter, PdfTextModel, PdfEditingFonts, layoutPdfText, hitPdfText, pdfSourceKey, browserPdfPaintHost, paintPdfPage, defaultPdfTextStyle, pdfFontKey, type PdfDocument, type PdfTextStyle, type PdfTextLayout } from '@tumblerjs/pdf';
  type Selection = { region: string; anchor: number[]; head: number[] };
  let { document: pdf, model, fonts, scale = 4/3, editable = true, adding = false, peers = [], onselection, onadded, onpagechange }: {
    document: PdfDocument; model: PdfTextModel; fonts: PdfEditingFonts; scale?: number; editable?: boolean; adding?: boolean;
    peers?: { id: string; name: string; color: string; selection?: Selection | null }[];
    onselection?: (selection: Selection | null) => void; onadded?: () => void; onpagechange?: (index: number) => void;
  } = $props();
  let revision = $state(0), active = $state<string>(), start = $state(0), end = $state(0), pending = $state<Partial<PdfTextStyle>>({});
  let input: HTMLTextAreaElement, root: HTMLDivElement;
  let value = $state(''), composing = false, dragging: { id: string; anchor: number } | undefined;
  const interpreter = $derived(new PdfInterpreter(pdf));
  const layouts = $derived.by(() => { void revision; return model.ids().map(id => layoutPdfText(model,id,fonts)); });
  let anchors: { first: ReturnType<PdfTextModel['anchor']>; last: ReturnType<PdfTextModel['anchor']> } | undefined;
  const currentStyle = $derived.by(() => { void revision; return active ? { ...model.styleAt(active,start), ...pending } : defaultPdfTextStyle; });
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
    if (event.key==='Escape') {active=undefined;onselection?.(null);}
    if (['ArrowUp','ArrowDown'].includes(event.key)) {
      const layout=layouts.find(l=>l.id===active), caret=layout?.carets.find(c=>c.offset===(input.selectionDirection==='backward'?start:end));
      if(layout&&caret) {event.preventDefault();const next=hitPdfText(layout,caret.x,caret.y+(event.key==='ArrowUp'?-1:1)*Math.max(model.seed(active).lineHeight,caret.height*1.25));const anchor=event.shiftKey?(input.selectionDirection==='backward'?end:start):next.offset;void select(active,anchor,next.offset);}
    }
  }
  function pointer(event: PointerEvent, page: number) {
    if (!editable || event.button !== 0) return;
    const host=event.currentTarget as HTMLElement, rect=host.getBoundingClientRect(), x=(event.clientX-rect.left)/scale,y=(event.clientY-rect.top)/scale;
    onpagechange?.(page);
    if (adding) {
      const id=crypto.randomUUID(); model.add({id,page,x,y,width:Math.max(24,pdf.pages[page]!.width-x-24),lineHeight:15,style:{...defaultPdfTextStyle},sources:[],delta:[]});
      void select(id,0);onadded?.();event.preventDefault();return;
    }
    const candidates=layouts.filter(l=>model.seed(l.id).page===page);
    const layout=candidates.filter(l=>{const s=model.seed(l.id);return x>=s.x-4&&x<=s.x+s.width+4&&y>=s.y-s.style.size&&y<=s.y+l.height;}).sort((a,b)=>Math.abs(model.seed(a.id).y-y)-Math.abs(model.seed(b.id).y-y))[0];
    if (!layout) { active=undefined;onselection?.(null);return; }
    const offset=hitPdfText(layout,x,y).offset;dragging={id:layout.id,anchor:offset}; host.setPointerCapture(event.pointerId);event.preventDefault();void select(layout.id,offset);
  }
  function move(event: PointerEvent) {
    if(!dragging)return;
    const host=event.currentTarget as HTMLElement,rect=host.getBoundingClientRect(),layout=layouts.find(l=>l.id===dragging!.id);
    if(layout)void select(layout.id,dragging.anchor,hitPdfText(layout,(event.clientX-rect.left)/scale,(event.clientY-rect.top)/scale).offset);
  }
  function double(event: MouseEvent, page: number) {
    if(!active||model.seed(active).page!==page)return;
    const text=model.text(active).toString(), segments=new Intl.Segmenter(undefined,{granularity:'word'});
    for(const segment of segments.segment(text))if(start>=segment.index&&start<=segment.index+segment.segment.length){void select(active,segment.index,segment.index+segment.segment.length);break;}
    event.preventDefault();
  }
  function paint(canvas: HTMLCanvasElement, page: number) {
    let disposed=false,controller:AbortController|undefined;
    const render=()=>{
      controller?.abort();controller=new AbortController(); const signal=controller.signal;
      const scene=interpreter.page(page), hidden=new Set(model.ids(page).filter(id=>model.dirty(id)).flatMap(id=>model.seed(id).sources.map(s=>`${s.instance}/${s.object}/${s.start}`)));
      const projected={...scene,elements:scene.elements.filter(e=>!hidden.has(pdfSourceKey(e.source)))};
      const host=browserPdfPaintHost(),ratio=window.devicePixelRatio||1,staging=window.document.createElement('canvas');
      staging.width=Math.ceil(scene.width*scale*ratio);staging.height=Math.ceil(scene.height*scale*ratio);
      void paintPdfPage(staging.getContext('2d')!,projected,pdf.source,host,{scale:scale*ratio,signal}).then(()=>{if(disposed||signal.aborted)return;canvas.width=staging.width;canvas.height=staging.height;canvas.getContext('2d')!.drawImage(staging,0,0);}).catch(error=>{if(!signal.aborted)console.error(error);}).finally(()=>host.close());
    };
    render();model.doc.on('afterTransaction',render);
    return {update(){render();},destroy(){disposed=true;controller?.abort();model.doc.off('afterTransaction',render);}};
  }
  function peerRange(peer: typeof peers[number], layout: PdfTextLayout) {
    try {if(!peer.selection||peer.selection.region!==layout.id)return;const resolve=(data:number[])=>Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(new Uint8Array(data)),model.doc);const a=resolve(peer.selection.anchor),b=resolve(peer.selection.head);if(!a||!b)return;return {start:Math.min(a.index,b.index),end:Math.max(a.index,b.index),caret:layout.carets.find(c=>c.offset===b.index)};}catch{return;}
  }
  onMount(()=>{
    const before=()=>{if(active&&input&&window.document.activeElement===input){anchors={first:model.anchor(active,input.selectionStart),last:model.anchor(active,input.selectionEnd)};}};
    const after=()=>{revision++;if(active&&!composing){const first=anchors&&model.resolve(anchors.first),last=anchors&&model.resolve(anchors.last);value=model.text(active).toString();input.value=value;if(first&&last){start=first.offset;end=last.offset;input.setSelectionRange(start,end);}}};
    model.doc.on('beforeTransaction',before);model.doc.on('afterTransaction',after);
    return()=>{model.doc.off('beforeTransaction',before);model.doc.off('afterTransaction',after);onselection?.(null);};
  });
</script>
<div class="pdf-editable" bind:this={root}>
  {#each pdf.pages as page}
    <div class="pdf-page" data-pdf-page={page.index+1} style:width={`${page.width*scale}px`} style:height={`${page.height*scale}px`} onpointerdown={e=>pointer(e,page.index)} onpointermove={move} onpointerup={()=>dragging=undefined} onpointercancel={()=>dragging=undefined} ondblclick={e=>double(e,page.index)} role="group" aria-label={`Page ${page.index+1}`}>
      <canvas use:paint={page.index} aria-label={`Page ${page.index+1}`} style:width="100%" style:height="100%"></canvas>
      <div class="text-layer" style:transform={`scale(${scale})`}>
        {#each layouts.filter(l=>model.seed(l.id).page===page.index) as layout (layout.id)}
          {@const dirty=model.dirty(layout.id)}
          {#each layout.glyphs as glyph}
            {#if glyph.text!=='\n'}<span class="glyph" aria-hidden="true" style:left={`${glyph.x}px`} style:top={`${glyph.y-glyph.style.size}px`} style:font-family={`PDF-${pdfFontKey(glyph.style)}`} style:font-size={`${glyph.style.size}px`} style:color={dirty?glyph.style.color:'transparent'} style:text-decoration={glyph.style.underline?'underline':'none'}>{glyph.text}</span>{/if}
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
  <textarea bind:this={input} aria-label="Edit PDF text" disabled={!editable} value={value} oninput={changed} onselect={publish} onkeyup={publish} onkeydown={key} oncompositionstart={()=>composing=true} oncompositionend={()=>{composing=false;changed();}} onblur={()=>onselection?.(null)} spellcheck="false" style:left={`${(active?layouts.find(l=>l.id===active)?.carets.find(c=>c.offset===start)?.x:0)??0}px`}></textarea>
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
