import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { preloadIdbStorage } from './utils/idbStorage'
import { installGlobalErrorHandlers } from './utils/log'

// The notes store lives in IndexedDB (see utils/idbStorage.ts). It has to be loaded into memory
// BEFORE any store module is evaluated — stores are created when they are first imported — so the
// app is imported dynamically, after this. Nothing above may import a store.
async function start() {
  installGlobalErrorHandlers()
  await preloadIdbStorage()
  const [{ default: App }, { ErrorBoundary }] = await Promise.all([
    import('./App.tsx'),
    import('./components/ErrorBoundary/ErrorBoundary'),
  ])

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary scope="app">
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}

void start()

// Development only: when an agent (or you) changes a .ts file, vite.config.ts doesn't apply it to the
// running page; it says so here, and the page offers a reload for when you're ready. Reloading saves
// every open note and waits for all writes to reach storage first (2026-10-28).
if (import.meta.hot) {
  let bar: HTMLDivElement | null = null
  import.meta.hot.on('organisaitor:code-changed', () => {
    if (bar) return
    bar = document.createElement('div')
    bar.className = 'dev-reload-bar'
    bar.setAttribute('role', 'status')
    const text = document.createElement('span')
    text.textContent = 'The app’s code changed. Reload when you’re ready: what you’ve typed is saved first.'
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Save and reload'
    button.addEventListener('click', async () => {
      button.disabled = true
      button.textContent = 'Saving…'
      const [{ flushOpenNoteEditors }, { settlePersistWrites }] = await Promise.all([
        import('./services/liveNoteEditor'),
        import('./utils/idbStorage'),
      ])
      flushOpenNoteEditors()
      await settlePersistWrites()
      location.reload()
    })
    bar.append(text, button)
    document.body.append(bar)
  })
}
