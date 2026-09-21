import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { preloadIdbStorage } from './utils/idbStorage'

// The notes store lives in IndexedDB (see utils/idbStorage.ts). It has to be loaded into memory
// BEFORE any store module is evaluated — stores are created when they are first imported — so the
// app is imported dynamically, after this. Nothing above may import a store.
async function start() {
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
