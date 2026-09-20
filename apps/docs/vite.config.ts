import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../../packages/svelte/package.json', import.meta.url), 'utf8')) as { version: string };
let commit = 'local';
try { commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { /* Source archives have no git metadata. */ }

export default defineConfig({
  plugins: [sveltekit()],
  resolve: { dedupe: ['svelte'] },
  ssr: { noExternal: [/^@tumblerjs\//] },
  define: { __TUMBLER_VERSION__: JSON.stringify(manifest.version), __TUMBLER_COMMIT__: JSON.stringify(commit) }
});
