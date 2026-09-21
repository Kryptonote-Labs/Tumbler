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
