import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {openOpcPackage, beginPackageTransaction} from '../../../packages/opc/src/index.ts';
const fixture = new URL('../static/samples/workspace-brief.pptx', import.meta.url);
test('normal autofit fits dense text and explicit overflow remains visible', async ({page}) => {
 const pkg = openOpcPackage(new Uint8Array(await readFile(fixture))), tx = beginPackageTransaction(pkg);
 const part = pkg.getPart('/ppt/slides/slide1.xml')!;
 const xml = new TextDecoder().decode(pkg.readPart(part)).replaceAll('A quieter workspace', 'A very long title that must shrink to fit its original text box without clipping any words').replace(/<a:bodyPr[^>]*(?:\/>|>[\s\S]*?<\/a:bodyPr>)/g, '<a:bodyPr><a:normAutofit/></a:bodyPr>');
 tx.replacePart(part.name, new TextEncoder().encode(xml));
 await page.goto('/playground/slides-brief');
 await expect(page.locator('.slide-stage').getByText('A quieter workspace', {exact:true}).last()).toBeVisible();
 await page.locator('input[type=file]').setInputFiles({name:'autofit.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:Buffer.from(tx.commit())});
 const text = page.locator('.slide-stage .slide-text').filter({hasText:'A very long title'});
 await expect(text).toBeVisible();
 await expect.poll(()=>text.locator('.paragraphs').evaluate(e=>Number((e as HTMLElement).style.zoom))).toBeLessThan(1);
 const fitted=await text.evaluate(e=>{const p=e.querySelector<HTMLElement>('.paragraphs')!;return p.getBoundingClientRect().height<=e.getBoundingClientRect().height+1;});
 expect(fitted).toBe(true);
});
