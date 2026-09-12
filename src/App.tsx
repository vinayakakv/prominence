import { lazy, Suspense } from 'react'
import MapView from './components/Map'

const Nilgiris = lazy(() => import('./pages/Nilgiris'))

const App = () =>
  window.location.pathname.replace(/\/$/, '') === '/nilgiris' ? (
    <Suspense fallback={<p role="status">Loading the Nilgiris…</p>}>
      <Nilgiris />
    </Suspense>
  ) : (
    <MapView />
  )

export default App
