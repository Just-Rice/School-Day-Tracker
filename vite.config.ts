/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH is set by the GitHub Pages workflow (e.g. /School-Day-Tracker/); '/' everywhere else.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
