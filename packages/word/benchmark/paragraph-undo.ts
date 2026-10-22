import * as Y from 'yjs';
import { strict as assert } from 'node:assert';
import { cpus } from 'node:os';
import { createWordCommands } from '../src/collaboration/commands.ts';
import { WordParagraphProjection } from '../src/collaboration/paragraph-projection.ts';

// Run the same file at both revisions with the shared host lock. Setup is not timed.
const count = 5000;
function sample() {
  const doc = new Y.Doc();
  doc.clientID = 100;
  const text = doc.getText('body');
  text.insert(0, 'Hello world\n' + 'Unchanged paragraph\n'.repeat(count - 1));
  const peer = new Y.Doc();
  peer.clientID = 200;
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
  let callbacks = 0;
  const projection = new WordParagraphProjection(text, slice => {
    callbacks++;
    return { slice, content: slice.parts.map(part => part.insert).join('') };
  });
  const initial = projection.paragraphs;
  const undo = new Y.UndoManager(text, { captureTimeout: 0 });
  text.format(0, 5, { bold: true });
  const remote = peer.getText('body');
  remote.applyDelta(createWordCommands().replaceWordDelta(remote, { start: 6, end: 11 }, 'team'));
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer), 'remote');
  void projection.paragraphs;
  callbacks = 0;
  let retain = 0;
  text.observe(event => { retain = event.delta.reduce((sum, part) => sum + (part.attributes ? part.retain ?? 0 : 0), 0); });
  Bun.gc(true);
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const start = performance.now();
  undo.undo();
  const result = projection.paragraphs;
  const ms = performance.now() - start;
  const used = process.cpuUsage(cpu);
  const after = process.memoryUsage();
  const reused = result.slice(1).filter((p, i) => p === initial[i + 1]).length;
  assert.equal(result.map(p => p.content).join(''), text.toString());
  assert.equal(text.toString(), 'Hello team\n' + 'Unchanged paragraph\n'.repeat(count - 1));
  assert.equal(result.length, count);
  const output = { ms, cpuUserUs: used.user, cpuSystemUs: used.system, heapDelta: after.heapUsed - memory.heapUsed, rssDelta: after.rss - memory.rss, callbacks, reused, attributeRetainCharacters: retain };
  undo.destroy(); projection.destroy(); peer.destroy(); doc.destroy();
  return output;
}
console.log(JSON.stringify({ runtime: Bun.version, cpu: cpus()[0]?.model, paragraphs: count, warmups: 2, samples: 5, note: 'heap/RSS deltas are live-memory proxies, not allocated-byte totals; timing includes undo and lazy projection' }));
for (let i = 0; i < 2; i++) sample();
for (let i = 0; i < 5; i++) console.log(JSON.stringify(sample()));
