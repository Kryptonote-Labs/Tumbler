import type { Doc } from './types';

export const developmentDoc: Doc = {
  title: 'Local development',
  description: 'Run the docs and playground against the source packages. No registry release or Kryptonote checkout is needed.',
  sections: [
    { id: 'run', title: 'Start the site', blocks: [
        { kind: 'code', language: 'Terminal', code: `git clone https://github.com/Kryptonote-Labs/Tumbler.git
cd Tumbler
bun install
bun run dev` },
        { kind: 'text', text: 'The SvelteKit application lives in apps/docs. Its dev command binds to 0.0.0.0, so you can open the network URL printed by Vite from another device on your LAN.' },
    ] },
    { id: 'examples', title: 'Repeatable examples', blocks: [
        { kind: 'text', text: 'Playground examples have stable URLs. Choose a narrow viewport to investigate overflow, switch to Edit to change content, and use Reset to reopen the original bytes. The sample documents are purpose-built MIT-licensed fixtures, with their generator in apps/docs/scripts.' },
        { kind: 'code', language: 'Terminal', code: `bun run --cwd apps/docs samples
bun run docs:check
bun run docs:build
bun run docs:test` },
        { kind: 'text', text: 'Install Playwright Chromium once with bunx playwright install chromium from apps/docs. Browser tests exercise the real viewer, including narrow-page scrolling and downloaded edits.' },
    ] },
    { id: 'deploy', title: 'Vercel deployment', blocks: [
        { kind: 'text', text: 'Use apps/docs as the Vercel root directory with the SvelteKit framework preset. Include source files outside the root directory so the workspace packages are available. Install from the repository root using bun install --frozen-lockfile, then build the app with bun run build.' },
        { kind: 'text', text: 'The site is prerendered. It needs no database, authentication service, or document storage. The displayed package version and commit identify the source used for each build.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/development.ts',
};
