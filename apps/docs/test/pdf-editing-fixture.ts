/// <reference types="bun" />
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import { pdfFixture, pdfStream } from '../../../packages/pdf/test/pdf-fixture.ts';
const root = resolve(import.meta.dir, '../../..');
const source = pdfFixture([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F 5 0 R >> >> /Contents 4 0 R >>',
  pdfStream('BT /F 12 Tf 20 150 Td (Start) Tj ET'),
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
]);
const font = Buffer.from(
  await Bun.file(
    resolve(root, 'packages/pdf/test/fixtures/editing-fonts/LiberationSans-Regular.ttf'),
  ).bytes(),
).toString('base64');
const host = `<script>
  import PdfEditableDocument from '${root}/packages/svelte/src/pdf/PdfEditableDocument.svelte';
  import {openPdfDocument,PdfTextModel,importPdfText,PdfEditingFonts,layoutPdfTextFlow} from '${root}/packages/pdf/src/index.ts';
  const pdf=openPdfDocument(new Uint8Array(${JSON.stringify([...source])})),model=new PdfTextModel(),fonts=new PdfEditingFonts();
  fonts.add('Sans-Regular',Uint8Array.from(atob(${JSON.stringify(font)}),c=>c.charCodeAt(0)));
  model.initialize(importPdfText(pdf));
  const id=model.ids()[0];
  model.replace(id,0,model.text(id).length,Array.from({length:30},(_,i)=>'Line '+i).join('\\n'));
  window.lastCaret=()=>layoutPdfTextFlow(model,fonts,pdf.pages).regions.find(region=>region.id===id&&region.page===0).carets.at(-1).offset;
  let adding=$state(false);
</script>
<button onclick={()=>adding=true}>Add text</button>
<PdfEditableDocument document={pdf} {model} {fonts} scale={2} {adding} onadded={()=>adding=false}/>
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
