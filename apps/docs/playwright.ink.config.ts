import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: 'word-ink-overlay.e2e.ts', workers: 1, timeout: 120_000,
  use: { baseURL: 'http://127.0.0.1:43987', launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] } },
  webServer: { command: 'bun run dev --port 43987 --strictPort', url: 'http://127.0.0.1:43987', reuseExistingServer: false, timeout: 120_000 },
});
