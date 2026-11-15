import { useEffect, useState } from 'react'
import Stage from './scene/Stage.jsx'
import { CameraPiP } from './ui/CameraPiP.jsx'
import { CommandBar } from './ui/CommandBar.jsx'
import { Subtitle } from './ui/Subtitle.jsx'
import { SceneControls } from './ui/SceneControls.jsx'
import { HandCursors } from './ui/HandCursors.jsx'
import { useKinex } from './store.js'
import { hasLLM } from './ai/llm.js'
import { toggleListening } from './voice/speech.js'
import { InspectPanel } from './ui/InspectPanel.jsx'
import { AxisGizmo } from './ui/AxisGizmo.jsx'
import { HDTray } from './ui/HDTray.jsx'
import { importModelFile } from './hd/importModel.js'
import { enterInspect, exitInspect, rotateModel } from './lib/viewer.js'

const typing = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

export default function App() {
  const preset = useKinex((s) => s.environment.preset)
  const inspecting = useKinex((s) => Boolean(s.inspectId))
  const [dragging, setDragging] = useState(false)

  // Drop any 3D file onto the page to view it.
  useEffect(() => {
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files')
    const over = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDragging(true)
    }
    const leave = (e) => {
      if (e.relatedTarget === null) setDragging(false)
    }
    const drop = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDragging(false)
      ;[...e.dataTransfer.files].forEach((f) => importModelFile(f))
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.scene = preset
  }, [preset])

  useEffect(() => {
    const onKey = (e) => {
      if (typing(document.activeElement)) return
      const st = useKinex.getState()
      const k = e.key.toLowerCase()
      if (st.inspectId) {
        if (k === 'escape') exitInspect()
        if (k === 'x' || k === 'y' || k === 'z') rotateModel(k, e.shiftKey ? -15 : 15)
      } else {
        if ((e.key === 'Delete' || e.key === 'Backspace') && st.hoverId) st.removeObject(st.hoverId)
        const target = st.hoverId || st.lastId
        if (k === 'i' && target) enterInspect(target)
      }
      if (k === 'm') toggleListening()
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
        <div className="pointer-events-auto">{inspecting ? <InspectPanel /> : <SceneControls />}</div>
        {!hasLLM && !inspecting && (
          <p className="panel pointer-events-auto max-w-[34ch] rounded-2xl px-4 py-2 text-sm text-muted">
            Add <code className="font-semibold text-ink">OPENAI_API_KEY</code> to <code className="font-semibold text-ink">.env</code> and
            restart to unlock the full builder. The offline builder handles simple shapes until then.
          </p>
        )}
      </header>

      <CameraPiP />
      <AxisGizmo />
      <HDTray />

      <section className="pointer-events-none fixed inset-x-4 bottom-4 z-30 flex flex-col gap-5 sm:inset-x-6 sm:bottom-6">
        <div className="pointer-events-none">
          <Subtitle />
        </div>
        <div className="pointer-events-auto">
          <CommandBar />
        </div>
      </section>

      {dragging && (
        <div className="pointer-events-none fixed inset-4 z-50 grid place-items-center rounded-[28px] border-2 border-dashed border-cobalt bg-white/40">
          <p className="panel rounded-2xl px-6 py-4 text-xl font-semibold text-ink">Drop a .glb, .gltf, .obj or .stl file to view it</p>
        </div>
      )}
      <HandCursors />
    </main>
  )
}
