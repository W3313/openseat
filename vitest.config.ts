import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node', // component tests opt into jsdom with a `// @vitest-environment jsdom` docblock on line 1
    setupFiles: ['tests/setup.ts'], // imports @testing-library/jest-dom/vitest
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: { provider: 'v8', include: ['src/lib/**'], thresholds: { lines: 80 } },
  },
});
