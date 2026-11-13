import { error } from '@sveltejs/kit';
import { docs } from '$lib/docs';
import { highlight } from '$lib/server/highlight';
import { highlightExample } from '$lib/server/examples';
import type { Block } from '$lib/docs/types';
import type { PageServerLoad, EntryGenerator } from './$types';

export const entries: EntryGenerator = () => Object.keys(docs).map((slug) => ({ slug }));

/** Code and example blocks gain pre-rendered `html`; other blocks pass through. */
async function renderBlock(block: Block) {
  if (block.kind === 'code') return { ...block, html: await highlight(block.code, block.language) };
  if (block.kind === 'example') return { ...block, html: await highlightExample(block.example) };
  return block;
}

export const load: PageServerLoad = async ({ params }) => {
  const doc = docs[params.slug];
  if (!doc) error(404, 'Page not found');
  const sections = await Promise.all(doc.sections.map(async section => ({
    ...section,
    blocks: await Promise.all(section.blocks.map(renderBlock)),
  })));
  return { doc: { ...doc, sections } };
};
