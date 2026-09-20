import { error } from '@sveltejs/kit';
import { samples } from '$lib/site';
import type { PageLoad, EntryGenerator } from './$types';
export const entries: EntryGenerator = () => samples.map(sample => ({ example: sample.id }));
export const load: PageLoad = ({ params }) => {
  const sample = samples.find(item => item.id === params.example);
  if (!sample) error(404, 'Example not found');
  return { sample };
};
