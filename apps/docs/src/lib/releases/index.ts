import { augustReleases } from './august';
import { septemberReleases } from './september';
import { octoberReleases } from './october';
import type { Release } from './types';

// Newest first. Dates record the first package publication in UTC.
export const releases: readonly Release[] = [...octoberReleases, ...septemberReleases, ...augustReleases];

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
});
export function formatReleaseDate(date: string): string {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`));
}
