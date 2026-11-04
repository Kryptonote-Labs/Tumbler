/// <reference types="bun" />
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import { pdfFixture, pdfStream } from '../../../packages/pdf/test/pdf-fixture.ts';
import { PdfEditingFonts, defaultPdfTextStyle } from '../../../packages/pdf/src/index.ts';
const root = resolve(import.meta.dir, '../../..');
const textBox = process.argv.includes('--text-box');
const program = await Bun.file(
  resolve(root, 'packages/pdf/test/fixtures/editing-fonts/LiberationSans-Regular.ttf'),
).bytes();
const metrics = new PdfEditingFonts();
metrics.add('Sans-Regular', program);
const face = metrics.get(defaultPdfTextStyle).font;
const widths = Array.from(
  { length: 95 },
  (_, i) => (face.glyphForCodePoint(i + 32).advanceWidth * 1000) / face.unitsPerEm,
);
const source = pdfFixture([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F 5 0 R >> >> /Contents 4 0 R >>',
  pdfStream(`BT /F 12 Tf 20 150 Td (${textBox ? 'First second third' : 'Start'}) Tj ET`),
  `<< /Type /Font /Subtype /TrueType /BaseFont /LiberationSans-Regular /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 126 /Widths [${widths.join(' ')}] /FontDescriptor 6 0 R >>`,
  '<< /Type /FontDescriptor /FontName /LiberationSans-Regular /Flags 32 /FontBBox [-500 -500 2000 2000] /Ascent 900 /Descent -200 /CapHeight 700 /ItalicAngle 0 /StemV 80 /FontFile2 7 0 R >>',
  pdfStream(program),
]);
const font = Buffer.from(program).toString('base64');
const mono = Buffer.from(
  await Bun.file(
    resolve(root, 'packages/pdf/test/fixtures/editing-fonts/LiberationMono-Regular.ttf'),
  ).bytes(),
).toString('base64');
const host = `<script>
  import PdfEditableDocument from '${root}/packages/svelte/src/pdf/PdfEditableDocument.svelte';
  import {openPdfDocument,PdfTextModel,importPdfText,PdfEditingFonts,layoutPdfTextFlow} from '${root}/packages/pdf/src/index.ts';
  const pdf=openPdfDocument(Uint8Array.from(atob(${JSON.stringify(Buffer.from(source).toString('base64'))}),c=>c.charCodeAt(0))),model=new PdfTextModel(),fonts=new PdfEditingFonts();
  fonts.add('Sans-Regular',Uint8Array.from(atob(${JSON.stringify(font)}),c=>c.charCodeAt(0)));
  fonts.add('Mono-Regular',Uint8Array.from(atob(${JSON.stringify(mono)}),c=>c.charCodeAt(0)));
  model.initialize(importPdfText(pdf));
  const id=model.ids()[0];
  if(!${textBox})model.replace(id,0,model.text(id).length,Array.from({length:30},(_,i)=>'Line '+i).join('\\n'));
  window.lastCaret=()=>layoutPdfTextFlow(model,fonts,pdf.pages).regions.find(region=>region.id===id&&region.page===0).carets.at(-1).offset;
  window.lastFace=()=>fonts.shape('X',model.styleAt(id,model.text(id).length)).face.key;
  window.remotePrefix=()=>model.replace(id,0,0,'B',{...model.styleAt(id,0),color:'#00ff00'});
  window.colours=()=>{const result=[];for(const run of model.text(id).toDelta()){const color=run.attributes?.color,last=result.at(-1);if(last?.color===color)last.insert+=run.insert;else result.push({insert:run.insert,color});}return result;};
  function repeated(){model.replace(id,0,model.text(id).length,'AAA');model.format(id,0,1,{color:'#ff0000'});model.format(id,1,3,{color:'#0000ff'});}
  let view;
  let adding=$state(false);
</script>
<button onclick={()=>adding=true}>Add text</button>
<button style="left:80px" onclick={()=>view.format({family:'Mono'})}>Mono</button>
<button style="left:150px" onclick={repeated}>Repeated text</button>
<PdfEditableDocument bind:this={view} document={pdf} {model} {fonts} scale={2} {adding} onadded={()=>adding=false}/>
<style>:global(body){margin:0;}button{position:fixed;top:0;left:0;z-index:1;}</style>`;
const built = await Bun.build({
  entrypoints: ['pdf-fixture'],
  target: 'browser',
  format: 'iife',
  conditions: ['browser'],
  plugins: [
    {
      name: 'pdf-editing',
      setup(builder) {
        builder.onResolve({ filter: /^pdf-fixture$/ }, () => ({
          path: 'entry',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: `import {mount} from 'svelte';import Host from 'pdf-host';mount(Host,{target:document.body});`,
          loader: 'js',
        }));
        builder.onResolve({ filter: /^pdf-host$/ }, () => ({
          path: 'Host.svelte',
          namespace: 'host',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'host' }, () => ({
          contents: compile(host, { generate: 'client', css: 'injected' }).js.code,
          loader: 'js',
        }));
        builder.onResolve({ filter: /^svelte(\/.*)?$/ }, ({ path }) => ({
          path:
            path === 'svelte'
              ? realpathSync(resolve(root, 'apps/docs/node_modules/svelte/src/index-client.js'))
              : Bun.resolveSync(path, resolve(root, 'apps/docs')),
        }));
        builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
          contents: compile(await Bun.file(path).text(), {
            filename: path,
            generate: 'client',
            css: 'injected',
          }).js.code,
          loader: 'js',
        }));
      },
    },
  ],
});
if (!built.success) throw new Error(built.logs.map(String).join('\n'));
process.stdout.write(await built.outputs[0]!.text());
