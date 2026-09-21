import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'android', 'src-tauri', '.vercel']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // An agent command sees and changes data ONLY through src/agent/access.ts, which is where
    // encrypted content is kept out of reach and where there is no delete. See docs/ai/02-command-layer.md.
    files: ['src/agent/commands/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/store/*', '@/services/*', '@/utils/quickAccess', '@/utils/persistStorage', '@/utils/idbStorage', '@/agent/batch', '@/agent/run', '@/agent/registry'],
          allowTypeImports: true,
          message: 'Agent commands must read and write through @/agent/access, never the stores or services directly.',
        }],
      }],
    },
  },
])
