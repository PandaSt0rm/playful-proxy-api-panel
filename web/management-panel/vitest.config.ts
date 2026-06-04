import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Standalone test config — deliberately does NOT pull in the production
// viteSingleFile/inlining pipeline. It mirrors the app's `@` alias and the
// `__APP_VERSION__` define so modules resolve and evaluate the same way.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('test'),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Don't compile component SCSS in tests — behaviour, not styling, is under
    // test, so CSS-module imports resolve to harmless empty objects.
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    clearMocks: true,
    restoreMocks: true,
    // Bounded parallelism. On the slow /mnt/c (Windows 9p) mount, the default
    // worker-per-core fan-out (24-core host => ~23 workers) made every worker
    // cold-load jsdom + i18n + react off the slow filesystem at once and
    // intermittently time out ("Timeout waiting for worker to respond"). Capping
    // the fork pool avoids that startup stampede while keeping real parallelism.
    //
    // Benchmarked full coverage runs (3972 tests): 1 worker ~15:04, 4 ~9:05,
    // 8 ~4:14, 12 ~3:19 — all green. The suite is I/O-bound on the 9p mount
    // (CPU only ~144% of 24 cores at 8 workers), so returns flatten past 8.
    // 8 captures the 2.1x win with comfortable margin under the async timeout;
    // bump toward 12 for a little more speed if the machine is otherwise idle.
    // `retry` absorbs residual cold-start flake. Isolation stays on, so each
    // file still gets a fresh module registry.
    pool: 'forks',
    minWorkers: 1,
    maxWorkers: 8,
    retry: 1,
    isolate: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/assets/**',
        'src/i18n/locales/**',
        'src/**/index.ts',
      ],
    },
  },
});
