import { error } from '@sveltejs/kit';
import { docs } from '$lib/docs';
import { highlight } from '$lib/server/highlight';
import type { PageServerLoad, EntryGenerator } from './$types';
export const entries: EntryGenerator = () => Object.keys(docs).map((slug) => ({ slug }));
export const load: PageServerLoad = async ({ params }) => {
  const doc = docs[params.slug];
  if (!doc) error(404, 'Page not found');
  const sections = await Promise.all(doc.sections.map(async section => ({
    ...section,
    blocks: await Promise.all(section.blocks.map(async block => block.kind === 'code'
      ? { ...block, html: await highlight(block.code, block.language) }
      : block))
  })));
  return { doc: { ...doc, sections } };
};
