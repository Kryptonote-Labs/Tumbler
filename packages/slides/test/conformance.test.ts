import {expect, test} from 'bun:test';
import {beginPackageTransaction, openOpcPackage} from '@tumblerjs/opc';
import {openPresentationDocument} from '../src/index.ts';
const encoder = new TextEncoder();
const fixture = () => Bun.file(new URL('../../../apps/docs/static/samples/workspace-brief.pptx', import.meta.url)).bytes();
const contents = (pkg: ReturnType<typeof openOpcPackage>, name: string) => new TextDecoder().decode(pkg.readPart(pkg.getPart(name)!));
test('layout theme overrides replace supplied schemes while retaining other theme components', async () => {
 const pkg = openOpcPackage(await fixture()), tx = beginPackageTransaction(pkg);
 const base = contents(pkg, '/ppt/theme/theme1.xml');
 const font = base.match(/<a:fontScheme[\s\S]*?<\/a:fontScheme>/)![0].replace(/<a:latin[^>]*\/>/g, '<a:latin typeface="Georgia"/>');
 tx.addPart('/ppt/theme/override.xml', 'application/vnd.openxmlformats-officedocument.themeOverride+xml', encoder.encode(`<a:themeOverride xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${font}</a:themeOverride>`));
 tx.addRelationship('/ppt/slideLayouts/slideLayout2.xml', {id:'themeOverride',type:'http://schemas.openxmlformats.org/officeDocument/2006/relationships/themeOverride', target:'/ppt/theme/override.xml'});
 const slide = contents(pkg, '/ppt/slides/slide1.xml').replace(/<a:latin[^>]*\/>/g, '<a:latin typeface="+mn-lt"/>');
 tx.replacePart('/ppt/slides/slide1.xml', encoder.encode(slide));
 const doc = openPresentationDocument(tx.commit());
 expect(doc.slides[0]!.objects.flatMap(o => o.text?.paragraphs.flatMap(p=>p.runs) ?? []).some(r=>r.fontFamily==='Georgia')).toBe(true);
 expect(doc.slides[0]!.background).toBe(openPresentationDocument(await fixture()).slides[0]!.background);
});
test('normal autofit applies saved line spacing reduction and preserves overflow modes', async () => {
 const pkg = openOpcPackage(await fixture()), tx = beginPackageTransaction(pkg);
 tx.replacePart('/ppt/slides/slide1.xml', encoder.encode(contents(pkg,'/ppt/slides/slide1.xml').replace(/<a:bodyPr[^>]*(?:\/>|>[\s\S]*?<\/a:bodyPr>)/g, '<a:bodyPr horzOverflow="clip" vertOverflow="ellipsis"><a:normAutofit fontScale="80000" lnSpcReduction="20000"/></a:bodyPr>')));
 const text = openPresentationDocument(tx.commit()).slides[0]!.objects.find(o=>o.layer==='slide' && o.text)!.text!;
 expect(text.autoFit).toBe('normal'); expect(text.verticalOverflow).toBe('ellipsis'); expect(text.horizontalOverflow).toBe('clip');
 expect(text.paragraphs[0]!.lineHeight).toBe(0.8);
});
test('mixed-script runs use their authored Latin, East Asian and complex-script fonts', async () => {
 const pkg=openOpcPackage(await fixture()),tx=beginPackageTransaction(pkg);
 tx.replacePart('/ppt/slides/slide1.xml',encoder.encode(contents(pkg,'/ppt/slides/slide1.xml').replace(/<a:r>[\s\S]*?<\/a:r>/, '<a:r><a:rPr lang="ja-JP"><a:latin typeface="Arial"/><a:ea typeface="Yu Gothic"/><a:cs typeface="Amiri"/></a:rPr><a:t>Hello 日本語 مرحبا</a:t></a:r>')));
 const runs=openPresentationDocument(tx.commit()).slides[0]!.objects.find(o=>o.layer==='slide'&&o.text)!.text!.paragraphs[0]!.runs;
 expect(runs.map(r=>r.fontFamily)).toEqual(['Arial','Yu Gothic','Amiri']);
 expect(runs.map(r=>r.text).join('')).toBe('Hello 日本語 مرحبا');
});
test('paragraphs retain custom tabs and distributed alignment', async()=>{
 const pkg=openOpcPackage(await fixture()),tx=beginPackageTransaction(pkg);
 tx.replacePart('/ppt/slides/slide1.xml',encoder.encode(contents(pkg,'/ppt/slides/slide1.xml').replace(/<a:pPr[^>]*(?:\/>|>[\s\S]*?<\/a:pPr>)/g,'<a:pPr algn="dist" marR="95250"><a:tabLst><a:tab pos="1905000" algn="dec"/><a:tab pos="952500" algn="r"/></a:tabLst></a:pPr>')));
 const p=openPresentationDocument(tx.commit()).slides[0]!.objects.find(o=>o.layer==='slide'&&o.text)!.text!.paragraphs[0]!;
 expect(p.tabs).toEqual([{position:100,alignment:'r'},{position:200,alignment:'dec'}]); expect(p.distributed).toBe(true);expect(p.marginRight).toBe(10);
});
test('uncompressed EOT fonts expose their original SFNT bytes', async()=>{
 const {embeddedFontBytes}=await import('../src/embedded-fonts.ts');
 const sfnt=new Uint8Array([0,1,0,0,0,0,0,0]);const eot=new Uint8Array(90);const v=new DataView(eot.buffer);
 v.setUint32(0,90,true);v.setUint32(4,8,true);v.setUint16(34,0x504c,true);eot.set(sfnt,82);
 expect(embeddedFontBytes(eot)).toEqual(sfnt);v.setUint32(12,4,true);expect(embeddedFontBytes(eot)).toBeUndefined();
});
test('media references resolve internal r:link sources without fetching external URLs', async()=>{
 const {readPresentationMedia}=await import('../src/media.ts'); const {parseLosslessXml}=await import('@tumblerjs/ooxml');
 const pkg=openOpcPackage(await fixture()),tx=beginPackageTransaction(pkg);
 tx.addPart('/ppt/media/test.mp4','video/mp4',new Uint8Array([0,1,2]));
 tx.addRelationship('/ppt/slides/slide1.xml',{id:'video1',type:'http://schemas.openxmlformats.org/officeDocument/2006/relationships/video',target:'/ppt/media/test.mp4'});
 const updated=openOpcPackage(tx.commit());
 const xml=parseLosslessXml(encoder.encode('<a:videoFile xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:link="video1"/>'));
 const media=readPresentationMedia(updated,'/ppt/slides/slide1.xml',xml.elements());
 expect(media?.kind).toBe('video');expect(media?.bytes).toEqual(new Uint8Array([0,1,2]));expect(media?.url).toBeUndefined();
});
test('SVG picture fills retain crop and tile placement for shapes and backgrounds', async()=>{
 const pkg=openOpcPackage(await fixture()),tx=beginPackageTransaction(pkg);
 tx.addPart('/ppt/media/tile.svg','image/svg+xml',encoder.encode('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="10" height="20" fill="green"/></svg>'));
 tx.addRelationship('/ppt/slides/slide1.xml',{id:'tileImage',type:'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',target:'/ppt/media/tile.svg'});
 const fill='<a:blipFill><a:blip r:embed="tileImage"/><a:srcRect l="10000"/><a:tile tx="95250" sx="50000" sy="100000" algn="ctr" flip="xy"/></a:blipFill>';
 let xml=contents(pkg,'/ppt/slides/slide1.xml').replace('<p:spPr>','<p:spPr>'+fill);
 xml=xml.replace(/<p:bg>[\s\S]*?<\/p:bg>/, '<p:bg><p:bgPr>'+fill+'</p:bgPr></p:bg>');
 tx.replacePart('/ppt/slides/slide1.xml',encoder.encode(xml));
 const slide=openPresentationDocument(tx.commit()).slides[0]!;const picture=slide.objects.find(o=>o.pictureFill)!.pictureFill!;
 expect(picture.contentType).toBe('image/svg+xml');expect(picture.crop[0]).toBe(0.1);expect(picture.tile).toMatchObject({x:10,scaleX:0.5,flip:'xy',align:'ctr'});
});
test('drawing patterns and supported effects retain authored parameters',async()=>{
 const pkg=openOpcPackage(await fixture()),tx=beginPackageTransaction(pkg);
 tx.replacePart('/ppt/slides/slide1.xml',encoder.encode(contents(pkg,'/ppt/slides/slide1.xml').replace('<p:spPr>','<p:spPr><a:pattFill prst="diagCross"><a:fgClr><a:srgbClr val="FF0000"/></a:fgClr><a:bgClr><a:srgbClr val="FFFFFF"/></a:bgClr></a:pattFill><a:effectLst><a:glow rad="95250"><a:srgbClr val="00FF00"/></a:glow><a:softEdge rad="19050"/></a:effectLst>')));
 const shape=openPresentationDocument(tx.commit()).slides[0]!.objects.find(o=>o.pattern)!;
 expect(shape.pattern?.preset).toBe('diagCross');expect(shape.effects?.map(e=>[e.kind,e.radius])).toEqual([['glow',5],['softEdge',1]]);
});
