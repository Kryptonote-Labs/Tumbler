import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fc from 'fast-check';
import * as Y from 'yjs';
import { applyTrackedWordDelta } from '../src/collaboration/text-events.ts';
import { wordTextRange } from '../src/collaboration/text-range.ts';
import { wordSnapshot } from '../src/collaboration/snapshot.ts';
import { WordParagraphProjection } from '../src/collaboration/paragraph-projection.ts';
import type { WordDelta } from '../src/collaboration/commands.ts';

const runs = Number(process.env.RUNS ?? 1000);
const seed = Number(process.env.SEED ?? 20261028);
assert(Number.isSafeInteger(runs) && runs > 0 && Number.isSafeInteger(seed));
const engineFiles = ['text-events.ts', 'text-index.ts', 'text-edit.ts', 'snapshot.ts', 'paragraph-identity.ts',
  'paragraph-projection.ts', 'checkpoint.ts', 'structured/view.ts', 'structured/legacy-tables.ts'];
const sources = Object.fromEntries(await Promise.all(engineFiles.map(async name => [name,
  createHash('sha256').update(new Uint8Array(await Bun.file(new URL('../src/collaboration/' + name, import.meta.url)).arrayBuffer())).digest('hex')])));
const action = fc.record({
  kind: fc.constantFrom('insert', 'delete', 'format', 'undo', 'redo', 'deliver', 'batch'),
  peer: fc.nat(2), at: fc.nat(10_000), count: fc.integer({ min: 1, max: 9 }),
  value: fc.constantFrom('x', 'é', '中', '😀', '👩🏽‍💻', 'e\u0301', '\n'), bold: fc.boolean(),
  reentrant: fc.boolean(),
});
let operations = 0, deliveries = 0, assertions = 0;
const expand = (parts: readonly { insert: string; attributes?: Readonly<Record<string, unknown>> }[]) =>
  parts.flatMap(part => Array.from({ length: part.insert.length }, (_, i) => ({ text: part.insert[i], attributes: part.attributes ?? {} })));
const property = fc.property(fc.boolean(), fc.array(action, { minLength: 30, maxLength: 160 }), (gc, actions) => {
  const original = new Y.Doc({ gc });
  original.clientID = 1;
  for (let i = 0; i < 80; i++) original.getText('body').insert(original.getText('body').length,
    `Run ${i} é 中 😀 e\u0301${i % 6 ? ' ' : '\n'}`, { wordSource: i + 1, bold: i % 2 === 0 });
  const create = (native: boolean) => {
    const peers = [101, 202, 303].map(clientID => {
      const doc = new Y.Doc({ gc }), text = doc.getText('body');
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(original));
      doc.clientID = clientID;
      const peer = { doc, text, armed: false, packets: [] as Uint8Array[],
        undo: new Y.UndoManager(text, { captureTimeout: 0 }),
        projection: undefined as WordParagraphProjection<readonly { insert: string; attributes?: Readonly<Record<string, unknown>> }[]> | undefined };
      text.observe(() => {
        if (peer.armed) { peer.armed = false; text.insert(0, 'observer ', { italic: true }); }
        assert.equal(wordTextRange(text).map(part => part.insert).join(''), text.toString());
        assertions++;
      });
      peer.projection = new WordParagraphProjection(text, slice => slice.parts);
      wordTextRange(text);
      wordSnapshot(doc);
      return peer;
    });
    for (const peer of peers) peer.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;
      for (const other of peers) if (other !== peer) other.packets.push(update.slice());
    });
    return { native, peers };
  };
  const networks = [create(true), create(false)];
  const check = () => {
    for (let index = 0; index < 3; index++) {
      const actual = networks[0]!.peers[index]!, expected = networks[1]!.peers[index]!;
      assert.deepEqual(actual.text.toDelta(), expected.text.toDelta());
      assert.deepEqual(Y.encodeStateAsUpdate(actual.doc), Y.encodeStateAsUpdate(expected.doc));
      assert.deepEqual(expand(wordTextRange(actual.text)), expand(expected.text.toDelta()));
      assert.deepEqual(expand(actual.projection!.paragraphs.flat()), expand(expected.text.toDelta()));
      assert(Y.equalSnapshots(wordSnapshot(actual.doc), Y.snapshot(actual.doc)));
      assert.equal(actual.packets.length, expected.packets.length);
      assertions += 6;
    }
  };
  const deliver = (index: number, at: number) => {
    for (const network of networks) {
      const peer = network.peers[index]!;
      if (!peer.packets.length) continue;
      const [packet] = peer.packets.splice(at % peer.packets.length, 1);
      Y.applyUpdate(peer.doc, packet!, 'remote');
      Y.applyUpdate(peer.doc, packet!, 'remote');
    }
    deliveries++;
  };
  try {
    for (const step of actions) {
      if (step.kind === 'deliver') deliver(step.peer, step.at);
      else for (const network of networks) {
        const peer = network.peers[step.peer]!, { doc, text, undo } = peer;
        if (step.kind === 'undo') undo.undo();
        else if (step.kind === 'redo') undo.redo();
        else {
          const value = text.toString();
          const boundary = (at: number) => value.charCodeAt(at - 1) >= 0xd800 && value.charCodeAt(at - 1) <= 0xdbff &&
            value.charCodeAt(at) >= 0xdc00 && value.charCodeAt(at) <= 0xdfff ? at - 1 : at;
          const at = boundary(step.at % (value.length + 1)), count = boundary(Math.min(value.length, at + step.count)) - at;
          const delta: WordDelta = [...(at ? [{ retain: at }] : []), ...(step.kind === 'delete' ? [{ delete: count }]
            : step.kind === 'format' ? [{ retain: count, attributes: { italic: step.bold ? true : null } }]
            : [{ insert: step.value, attributes: { bold: step.bold, wordSource: 1 } }])];
          peer.armed = step.reentrant;
          try {
            doc.transact(() => {
              if (network.native) applyTrackedWordDelta(text, delta);
              else text.applyDelta(structuredClone(delta));
              assert(Y.equalSnapshots(wordSnapshot(doc), Y.snapshot(doc)));
              if (step.kind === 'batch') {
                if (network.native) applyTrackedWordDelta(text, [{ insert: 'batched ' }]);
                else text.applyDelta([{ insert: 'batched ' }]);
              }
            });
          } finally { peer.armed = false; }
        }
      }
      operations++;
      check();
    }
    for (let round = 0; round < 20 && networks[0]!.peers.some(peer => peer.packets.length); round++)
      for (let index = 0; index < 3; index++)
        while (networks[0]!.peers[index]!.packets.length) deliver(index, round % 2 ? 0 : networks[0]!.peers[index]!.packets.length - 1);
    check();
    assert(networks[0]!.peers.every(peer => !peer.packets.length));
    const first = expand(networks[0]!.peers[0]!.text.toDelta());
    for (const peer of networks[0]!.peers) assert.deepEqual(expand(peer.text.toDelta()), first);
  } finally {
    original.destroy();
    for (const network of networks) for (const peer of network.peers) {
      peer.undo.destroy(); peer.projection!.destroy(); peer.doc.destroy();
    }
  }
});
const start = performance.now();
const result = fc.check(property, { numRuns: runs, seed, endOnFailure: true });
const evidence = { bun: Bun.version, sources, runs: result.numRuns, seed: result.seed, failed: result.failed, operations, deliveries, assertions,
  seconds: (performance.now() - start) / 1000,
  ...(result.failed ? { path: result.counterexamplePath, counterexample: result.counterexample,
    error: result.errorInstance instanceof Error ? result.errorInstance.stack : String(result.errorInstance) } : {}) };
console.log(JSON.stringify(evidence, null, 2));
if (result.failed) process.exitCode = 1;
