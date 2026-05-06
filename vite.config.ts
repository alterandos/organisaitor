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
    // Tauri targets: chrome105 on Windows, safari13 on iOS/macOS. Web build uses es2020.
    target: process.env.TAURI_ENV_PLATFORM
      ? (process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13')
      : 'es2020',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },

  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
})
