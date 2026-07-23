import { defineConfig, devices } from '@playwright/test';

// Browser journeys run the release single-file artifact. Management API calls
// are intercepted with deterministic fixtures, so no external backend is required.
const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1568, height: 968 } },
    },
    {
      name: 'desktop-firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'desktop-webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'tablet-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } },
    },
    {
      name: 'tablet-boundary-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 769, height: 900 } },
    },
    {
      name: 'mobile-boundary-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'mobile-wide-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 440, height: 1000 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'reduced-motion-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1568, height: 968 },
        reducedMotion: 'reduce',
      },
    },
    {
      name: 'reduced-motion-tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
        reducedMotion: 'reduce',
      },
    },
    {
      name: 'reduced-motion-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
      },
    },
  ],
  webServer: {
    command: `bun run build && bun run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
