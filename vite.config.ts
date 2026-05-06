import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  // Tauri: don't wipe the terminal output (Tauri logs there too)
  clearScreen: false,

  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Don't trigger HMR for Rust source changes (handled by Tauri)
      ignored: ['**/src-tauri/**'],
    },
  },

  // Expose TAURI_ENV_* vars to the frontend (used for build target selection)
  envPrefix: ['VITE_', 'TAURI_ENV_*'],

  build: {
    // Tauri supports modern targets on Windows; keep sourcemaps in debug
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },

  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
})
