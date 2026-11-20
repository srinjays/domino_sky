import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4189';
export default defineConfig({
  testDir: './e2e',
  use: { baseURL, channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
  webServer: {
    command: 'node apps/server/dist/index.js',
    env: { PORT: '4189', NODE_ENV: 'production', GEMINI_API_KEY: '', GROQ_API_KEY: '' },
    url: baseURL + '/api/health',
    reuseExistingServer: false,
  },
});
