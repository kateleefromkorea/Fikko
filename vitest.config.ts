import { defineConfig } from 'vitest/config'

// Unit tests for the server functions and shared libraries. Kept apart from
// vite.config.ts so tests don't load the app's dev-server plugins.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['api/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
