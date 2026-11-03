import { chromium } from "playwright-core";
import { openPdfDocument, PdfInterpreter } from "../../packages/pdf/src/index.ts";

const entry = new URL("../../packages/pdf/src/index.ts", import.meta.url).pathname;
let compiled: Promise<string> | undefined;
function browserScript() {
  return (compiled ??= (async () => {
    const built = await Bun.build({
      entrypoints: ["pdf-browser-entry"],
      target: "browser",
      format: "iife",
      conditions: ["browser"],
      plugins: [
        {
          name: "pdf-browser-painter",
          setup(builder) {
            builder.onResolve({ filter: /^pdf-browser-entry$/ }, () => ({
              path: "entry",
              namespace: "entry",
            }));
            builder.onLoad({ filter: /.*/, namespace: "entry" }, () => ({
              loader: "js",
              contents: `
          import {openPdfDocument,PdfInterpreter,paintPdfPage,browserPdfPaintHost} from '${entry}';
          window.renderPdf=async(bytes,password,indexes)=>{
            const document=openPdfDocument(new Uint8Array(bytes),password?{password}:{}),engine=new PdfInterpreter(document),host=browserPdfPaintHost(),images=[];
            try{for(const index of indexes){
              const scene=engine.page(index),canvas=window.document.createElement('canvas');canvas.width=Math.ceil(scene.width);canvas.height=Math.ceil(scene.height);
              await paintPdfPage(canvas.getContext('2d'),scene,document.source,host,{scale:1});images.push(canvas.toDataURL().split(',')[1]);engine.releasePage(index);
            }return images;}finally{host.close();}
          };`,
            }));
          },
        },
      ],
    });
    if (!built.success) throw new Error(built.logs.map(String).join("\n"));
    return built.outputs[0]!.text();
  })());
}
/** Production browser byte parsing, font decoding and painting, independently scored against PDFium. */
export async function renderBrowserPdf(
  bytes: Uint8Array,
  password?: string,
  indexes?: readonly number[],
) {
  const document = openPdfDocument(bytes, password ? { password } : {}),
    engine = new PdfInterpreter(document);
  const selected = indexes ?? document.pages.map((_, index) => index);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><meta charset="utf-8">');
    await page.addScriptTag({ content: await browserScript() });
    const images = await page.evaluate<string[]>(
      `window.renderPdf(${JSON.stringify([...bytes])},${JSON.stringify(password ?? "")},${JSON.stringify(selected)})`,
    );
    return selected.map((index, i) => ({
      scene: engine.page(index),
      png: Buffer.from(images[i]!, "base64"),
    }));
  } finally {
    await browser.close();
  }
}
