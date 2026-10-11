import { defineConfig } from '@playwright/test';
import base from './playwright.config';
// Capability measurements can fail without turning the ordinary docs regression suite red.
export default defineConfig({ ...base, testDir: './benchmark', outputDir: process.env.EVERYDAY_BROWSER_OUTPUT ?? 'test-results/everyday', retries: 0 });
