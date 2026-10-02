import * as Y from 'yjs';

const identities = new WeakMap<Y.Text, Map<number, string>>();

/** Track paragraph terminators through deltas instead of searching the CRDT from its start per line. */
export function wordParagraphIdentity(text: Y.Text, at: number): string {
  let positions = identities.get(text);
  if (!positions) {
    positions = new Map();
    identities.set(text, positions);
    text.observe(event => {
      const previous = [...positions!.entries()].sort((a,b) => a[0]-b[0]);
      positions!.clear();
      let item = 0, before = 0, after = 0;
      const retain = (length: number) => {
        const end = before + length;
        while (item < previous.length && previous[item]![0] < end) {
          const [offset, id] = previous[item++]!;
          positions!.set(after + offset - before, id);
        }
        before = end; after += length;
      };
      for (const part of event.delta) {
        if (part.retain) retain(part.retain);
        if (part.delete) {
          before += part.delete;
          while (item < previous.length && previous[item]![0] < before) item++;
        }
        if (part.insert !== undefined) after += typeof part.insert === 'string' ? part.insert.length : 1;
      }
      while (item < previous.length) {
        const [offset, id] = previous[item++]!;
        positions!.set(after + offset - before, id);
      }
    });
  }
  let id = positions.get(at);
  if (id === undefined) {
    const identity = Y.createRelativePositionFromTypeIndex(text, at).item;
    id = identity ? `${identity.client}:${identity.clock}` : 'end';
    positions.set(at, id);
  }
  return id;
}
