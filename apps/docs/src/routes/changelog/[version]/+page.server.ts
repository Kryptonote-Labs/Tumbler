import { error } from '@sveltejs/kit';
import { releases, formatReleaseDate } from '$lib/releases';
import { repository } from '$lib/site';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => releases.map(release => ({ version: release.version }));

export const load: PageServerLoad = ({ params }) => {
  const release = releases.find(release => release.version === params.version);
  if (!release) error(404, 'Release not found');
  const sourceUrl = release.commit
    ? release.previousCommit ? `${repository}/compare/${release.previousCommit}...${release.commit}` : `${repository}/commit/${release.commit}`
    : undefined;
  return {
    release, dateLabel: formatReleaseDate(release.date), sourceUrl,
    registryUrl: `https://registry.npmjs.org/@tumblerjs/${release.registryPackage}/${release.version}`,
  };
};
