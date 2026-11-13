import { error } from '@sveltejs/kit';
import { componentDocs } from '$lib/examples/components';
import { highlightExample, highlightLoader } from '$lib/server/examples';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => componentDocs.map(({ slug }) => ({ slug }));

export const load: PageServerLoad = async ({ params }) => {
  const index = componentDocs.findIndex(doc => doc.slug === params.slug);
  const doc = componentDocs[index];
  if (!doc) error(404, 'Component not found');
  return {
    doc,
    previous: componentDocs[index - 1],
    next: componentDocs[index + 1],
    exampleHtml: await highlightExample(doc.slug),
    loader: await highlightLoader(doc.slug),
  };
};
