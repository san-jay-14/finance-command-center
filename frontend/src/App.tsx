import { Dashboard } from './dashboard/Dashboard'

// The assistant surface (chat log, canvas, voice input, insights banner) is
// intentionally unmounted while the dashboard base ships — it returns as the
// voice orb + floating window system in the next build session. Components
// remain in src/components/ untouched.
function App() {
  return <Dashboard />
}

export default App
