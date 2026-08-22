import { mergeConfig } from 'vite'
import viteConfig from './vite.config.ts'
import { sharedVitestConfig } from './vitest.shared.ts'

export default mergeConfig(viteConfig, {
  ...sharedVitestConfig,
  test: {
    ...sharedVitestConfig.test,
    include: ['src/**/*.integration.test.ts', 'src/**/*.integration.test.tsx'],
  },
})
