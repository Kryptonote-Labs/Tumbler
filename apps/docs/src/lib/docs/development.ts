import type { Doc } from './types';

export const developmentDoc: Doc = {
  title: 'Local development',
  description: 'Run this site and its playground against the package source.',
  sections: [
    { id: 'run', title: 'Start the site', blocks: [
      { kind: 'code', language: 'Terminal', code: `git clone https://github.com/Kryptonote-Labs/Tumbler.git
cd Tumbler
bun install
bun run dev` },
      { kind: 'text', text: 'The site lives in `apps/docs` and uses the packages from the repository directly, so no published release is needed. The dev server listens on all network interfaces; open the network URL Vite prints to test on another device.' },
    ] },
    { id: 'examples', title: 'Samples and tests', blocks: [
      { kind: 'table', headers: ['Command', 'Does'], rows: [
        ['`bun run --cwd apps/docs samples`', 'Regenerates the sample documents.'],
        ['`bun run docs:check`', 'Type-checks the site.'],
        ['`bun run docs:build`', 'Builds the site.'],
        ['`bun run docs:test`', 'Runs the browser tests.'],
      ] },
      { kind: 'text', text: 'Before the first test run, install Chromium for Playwright from `apps/docs`:' },
      { kind: 'code', language: 'Terminal', code: 'bunx playwright install chromium' },
      { kind: 'text', text: 'The tests drive the real viewers, including scrolling on narrow screens and downloading edited files.' },
      { kind: 'text', text: 'The sample documents were made for these docs and are MIT-licensed. Their generator is in `apps/docs/scripts`.' },
      { kind: 'text', text: 'Each playground example has a stable URL. Narrow the window to check overflow, switch to Edit to change the content, and use Reset to reopen the original file.' },
    ] },
    { id: 'deploy', title: 'Deploy to Vercel', blocks: [
      { kind: 'list', items: [
        'Set the root directory to `apps/docs` and the framework preset to SvelteKit.',
        'Include source files outside the root directory, so the workspace packages are available.',
        'Install from the repository root with `bun install --frozen-lockfile`.',
        'Build with `bun run build`.',
      ] },
      { kind: 'text', text: 'The site is prerendered, so it needs no database, sign-in service or file storage. Each build shows the package version and commit it was built from.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/development.ts',
};
