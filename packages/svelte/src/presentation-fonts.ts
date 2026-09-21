import type {PresentationEmbeddedFont} from '@tumblerjs/slides';
export const presentationFontContext=Symbol('presentation-fonts');
export interface PresentationFontContext {family: (name:string)=>string}
const aliases=new WeakMap<Uint8Array,string>(); let serial=0;
/** Each document gets private font names so two open presentations cannot replace each other's fonts. */
export function loadPresentationFonts(fonts:readonly PresentationEmbeddedFont[]) {
 const families=new Map<string,string>(),faces:FontFace[]=[];
 for(const font of fonts){
   let name=families.get(font.family) ?? aliases.get(font.bytes);
   if(!name)name=`TumblerEmbedded${++serial}`;
   families.set(font.family,name); aliases.set(font.bytes,name);
   const face=new FontFace(name,Uint8Array.from(font.bytes).buffer,{weight:font.bold?'700':'400',style:font.italic?'italic':'normal'});
   document.fonts.add(face);faces.push(face);void face.load().catch(()=>{});
 }
 return {family:(name:string)=> families.has(name)?`"${families.get(name)}", ${JSON.stringify(name)}`:JSON.stringify(name), destroy:()=>{for(const face of faces)document.fonts.delete(face);}};
}
