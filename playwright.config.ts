import { defineConfig, devices } from '@playwright/test';

// Runs against the local stack with seed data (supabase start, functions serve, pnpm dev).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  // Flows share the seed users, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    ...devices['Pixel 7'],
    geolocation: { latitude: 1.2795, longitude: 103.8506, accuracy: 15 },
    permissions: ['geolocation', 'camera'],
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'mobile-chromium' }],
});
