import { useEffect } from 'react'
import Stage from './scene/Stage.jsx'
import { CameraPiP } from './ui/CameraPiP.jsx'
import { CommandBar } from './ui/CommandBar.jsx'
import { Subtitle } from './ui/Subtitle.jsx'
import { SceneControls } from './ui/SceneControls.jsx'
import { HandCursors } from './ui/HandCursors.jsx'
import { useKinex } from './store.js'
import { hasGemini } from './ai/gemini.js'
import { toggleListening } from './voice/speech.js'

const typing = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

export default function App() {
  const preset = useKinex((s) => s.environment.preset)

  useEffect(() => {
    document.documentElement.dataset.scene = preset
  }, [preset])

  useEffect(() => {
    const onKey = (e) => {
      if (typing(document.activeElement)) return
      const st = useKinex.getState()
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.hoverId) st.removeObject(st.hoverId)
      if (e.key === 'm' || e.key === 'M') toggleListening()
      if (e.key === '/') {
        e.preventDefault()
        document.getElementById('kinex-input')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <main className="relative h-full w-full">
      <h1 className="sr-only">Kinex</h1>
      <Stage />
      {/* Studio falloff toward the edges of the paper sweep. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-10"
        style={{ background: 'radial-gradient(120% 95% at 50% 42%, transparent 55%, rgb(20 24 48 / 0.16))' }}
      />

      <header className="pointer-events-none fixed left-4 top-4 z-30 flex flex-col items-start gap-3 sm:left-6 sm:top-5">
        <p className="pointer-events-auto text-[26px] font-bold leading-none tracking-[-0.03em]" style={{ color: 'var(--stage-ink)' }}>
          Kinex
        </p>
        <div className="pointer-events-auto">
          <SceneControls />
        </div>
        {!hasGemini && (
          <p className="panel pointer-events-auto max-w-[34ch] rounded-2xl px-4 py-2 text-sm text-muted">
            Add <code className="font-semibold text-ink">GEMINI_API</code> to <code className="font-semibold text-ink">.env</code> and
            restart to unlock the full builder. The offline builder handles simple shapes until then.
          </p>
        )}
      </header>

      <CameraPiP />

      <section className="pointer-events-none fixed inset-x-4 bottom-4 z-30 flex flex-col gap-5 sm:inset-x-6 sm:bottom-6">
        <div className="pointer-events-none">
          <Subtitle />
        </div>
        <div className="pointer-events-auto">
          <CommandBar />
        </div>
      </section>

      <HandCursors />
    </main>
  )
}
