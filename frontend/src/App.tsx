import { VoiceInput } from './components/VoiceInput'

// Sidebar-free, single-page layout per PROJECT_BRIEF.md section 1.
// The center canvas will host generative UI components (section 6) once the
// intent router and component registry exist — for now it's an empty shell.
function App() {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 px-6 py-4">
        <h1 className="text-lg font-semibold text-neutral-900">Finance Command Center</h1>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <div id="canvas" className="h-full w-full max-w-4xl rounded-xl border border-dashed border-neutral-300" />
      </main>

      <footer className="px-6 py-6">
        <div className="mx-auto max-w-2xl">
          <VoiceInput />
        </div>
      </footer>
    </div>
  )
}

export default App
