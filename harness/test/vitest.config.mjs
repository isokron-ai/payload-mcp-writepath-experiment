// Runs the plugin's unit tests (packages/plugin-mcp/src/**/*.spec.ts) with this folder's pinned dependencies.
// run.sh links packages/plugin-mcp/node_modules to ./node_modules first (git-ignored), so imports resolve as they do
// in Payload's monorepo.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export default defineConfig({
  root: repo,
  cacheDir: path.join(repo, 'harness/test/node_modules/.vite'),
  // packages/plugin-mcp/tsconfig.json extends a monorepo file that is not in this repository; give esbuild the
  // options directly so it does not try to load it.
  esbuild: { tsconfigRaw: JSON.stringify({ compilerOptions: { target: 'es2022', useDefineForClassFields: true } }) },
  test: {
    include: ['packages/plugin-mcp/src/**/*.spec.ts'],
    environment: 'node',
    reporters: ['verbose'],
  },
})
