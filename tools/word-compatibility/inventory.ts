import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import topicsJson from './catalog/topics.json';
import sourcesJson from './catalog/sources.json';
import lock from './catalog/lock.json';
import type { Topic } from './model.ts';

export const topics: readonly Topic[] = topicsJson;
export const sources = sourcesJson;
export const scope = lock.scope;
export const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export function verifyInventory(): string {
  for (const [name, expected] of Object.entries(lock.files)) {
    const bytes = readFileSync(new URL(`catalog/${name}`, import.meta.url));
    if (sha256(bytes) !== expected) throw new Error(`Inventory checksum mismatch: ${name}. Review and version scope changes.`);
  }
  if (topics.length !== lock.topics || new Set(topics.map(topic => topic.id)).size !== topics.length) throw new Error('Inventory count/identity mismatch');
  for (const topic of topics) {
    if (!sources.some(source => source.id === topic.source) || topic.id !== `${topic.source}:${topic.section}` || !topic.title || topic.page < 1) throw new Error(`Invalid topic ${topic.id}`);
  }
  for (const source of sources) {
    if (topics.filter(topic => topic.source === source.id).length !== source.selectedLeafTopics) throw new Error(`Source count mismatch ${source.id}`);
  }
  return sha256(readFileSync(new URL('catalog/lock.json', import.meta.url)));
}
