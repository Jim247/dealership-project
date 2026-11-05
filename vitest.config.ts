import { defineConfig } from 'vitest/config';

// One `npm run test:ts` runs every TypeScript suite. Each workspace keeps its own config.
export default defineConfig({
  test: {
    projects: ['shared', 'cli', 'web', 'scripts'],
  },
});
