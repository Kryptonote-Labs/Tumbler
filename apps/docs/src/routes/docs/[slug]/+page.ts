import { error } from '@sveltejs/kit';
import { docs } from '$lib/docs';
import type { PageLoad, EntryGenerator } from './$types';
export const entries: EntryGenerator = () => Object.keys(docs).map((slug) => ({ slug }));
export const load: PageLoad = ({ params }) => {
  const doc = docs[params.slug];
  if (!doc) error(404, 'Page not found');
  return { doc };
};
