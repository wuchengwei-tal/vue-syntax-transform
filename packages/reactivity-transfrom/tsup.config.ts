import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'index.ts',
  ],
  external: [
    'vscode',
  ],
  format: [
    'cjs',
  ],
  shims: false,
})
