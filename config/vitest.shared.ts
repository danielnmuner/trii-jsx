import { defineConfig } from 'vitest/config'

export const sharedVitestConfig = defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: true,
  },
})
