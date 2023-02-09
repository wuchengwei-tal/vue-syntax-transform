import { defineConfig, UserConfig } from 'vitest/config'

export default defineConfig({
  define: {
    __TEST__: true,
    __GLOBAL__: false,
    __ESM_BROWSER__: false
  },
  resolve: {
    //
  },
  test: {
    globals: true,
    sequence: {
      hooks: 'list'
    }
  }
}) as UserConfig
