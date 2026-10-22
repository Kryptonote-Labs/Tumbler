// Run with: flock -x /tmp/tumbler-word-audit-heavy.lock bun packages/word/test/session-dispatch.bench.ts
import { cpus } from "node:os";
const { openWordEditingSession }: typeof import("../src/session.ts") = await import(process.env.WORD_SESSION_MODULE ?? "../src/session.ts");
import { buildWordDocumentFixture } from "./document-fixture.ts";

const bytes = buildWordDocumentFixture({ documentXml: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>A</w:t></w:r></w:p></w:body></w:document>' });
const session = openWordEditingSession(bytes);
const paragraph = session.artifact.document.blocks[0];
if (paragraph?.kind !== "paragraph") throw new Error("Missing paragraph");
const position = { paragraphElementId: paragraph.elementId, offset: 1 };
session.replaceText({ anchor: position, focus: position }, "B");
let calls = 0;
for (let index = 0; index < 8; index++) session.subscribe(() => { calls++; });
function sample() {
  Bun.gc(true);
  const heapBefore = process.memoryUsage().heapUsed;
  const cpuBefore = process.cpuUsage();
  const start = performance.now();
  const callsBefore = calls;
  for (let index = 0; index < 20_000; index++) { session.undo(); session.redo(); }
  const ms = performance.now() - start;
  const cpu = process.cpuUsage(cpuBefore);
  const heapDelta = process.memoryUsage().heapUsed - heapBefore;
  if (calls - callsBefore !== 320_000 || !session.canUndo || session.canRedo || !session.dirty) throw new Error("Incorrect dispatch/history");
  return { ms, cpuUs: cpu.user + cpu.system, heapDelta, events: 40_000, listenerCalls: calls - callsBefore };
}
for (let index = 0; index < 3; index++) sample();
console.log(JSON.stringify({ bun: Bun.version, cpu: cpus()[0]?.model, warmups: 3, samples: Array.from({ length: 7 }, sample) }, null, 2));
