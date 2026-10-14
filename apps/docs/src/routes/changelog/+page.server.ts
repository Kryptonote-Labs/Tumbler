import { releases, formatReleaseDate } from '$lib/releases';

const monthFormatter = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function load() {
  const months = [...new Set(releases.map(release => release.date.slice(0, 7)))];
  return { groups: months.map(id => ({
    id,
    label: monthFormatter.format(new Date(`${id}-01T00:00:00Z`)),
    releases: releases.filter(release => release.date.startsWith(id)).map(release => ({
      version: release.version, date: release.date, dateLabel: formatReleaseDate(release.date),
      summary: release.summary, partial: release.partial ?? false,
    })),
  })) };
}
