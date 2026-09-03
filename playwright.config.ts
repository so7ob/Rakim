import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173', locale: 'ar-YE', timezoneId: 'Asia/Aden', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run start -w @ylp/api', url: 'http://127.0.0.1:4000/api/v1/health', reuseExistingServer: true, timeout: 30_000 },
    { command: 'npm run preview -w @ylp/web -- --port 4173', url: 'http://127.0.0.1:4173/ar', reuseExistingServer: true, timeout: 30_000 },
  ],
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet-1024', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 900 } } },
    { name: 'mobile-390', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
  ],
});

