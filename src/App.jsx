import { useEffect, useRef, useState } from 'react'
import Stage from './scene/Stage.jsx'
import { CameraPiP } from './ui/CameraPiP.jsx'
import { CommandBar } from './ui/CommandBar.jsx'
import { Subtitle } from './ui/Subtitle.jsx'
import { SceneControls } from './ui/SceneControls.jsx'
import { HandCursors } from './ui/HandCursors.jsx'
import { useKinex } from './store.js'
import { hasLLM } from './ai/llm.js'
import { exportNow } from './ai/commands.js'
import { toggleListening } from './voice/speech.js'
import { AxisGizmo } from './ui/AxisGizmo.jsx'
import { HDTray } from './ui/HDTray.jsx'
import { Sidebar } from './ui/Sidebar.jsx'
import { Icon } from './ui/Icon.jsx'
import { Guide, Modal } from './ui/Guide.jsx'
import { importModelFile, IMPORT_EXTENSIONS } from './hd/importModel.js'
import { enterInspect, exitInspect, rotateModel, snapView } from './lib/viewer.js'
import { initializeWorkspace, saveWorkspace } from './lib/workspace.js'
import { newWorkspace } from './lib/starters.js'
import { InteractionTools } from './ui/InteractionTools.jsx'

const typing = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)

export default function App() {
  const projectName = useKinex((s) => s.projectName)
  const preset = useKinex((s) => s.environment.preset)
  const inspecting = useKinex((s) => Boolean(s.inspectId))
  const objects = useKinex((s) => s.objects)
  const saveState = useKinex((s) => s.saveState)
  const ready = useKinex((s) => s.workspaceReady)
  const status = useKinex((s) => s.status)
  const hands = useKinex((s) => s.handsSeen)
  const highQuality = useKinex((s) => s.renderQuality === 'high')
  const [dragging, setDragging] = useState(false)
  const [guide, setGuide] = useState(false)
  const [newWorld, setNewWorld] = useState(false)
  const [focus, setFocus] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  const file = useRef()
  const thinking = status.kind === 'thinking'

  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)')
    const update = () => setCompact(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    let cancelled = false
    let dispose
    initializeWorkspace().then((cleanup) => { if (cancelled) cleanup(); else dispose = cleanup })
    return () => { cancelled = true; dispose?.() }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.scene = preset
    document.title = `${projectName} — Kinex Studio`
  }, [preset, projectName])

  useEffect(() => {
    const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes('Files')
    const over = (event) => { if (hasFiles(event)) { event.preventDefault(); setDragging(true) } }
    const leave = (event) => { if (event.relatedTarget === null) setDragging(false) }
    const drop = (event) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      setDragging(false)
      if (useKinex.getState().status.kind === 'thinking') return
      ;[...event.dataTransfer.files].reduce((promise, item) => promise.then(() => importModelFile(item)), Promise.resolve())
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop) }
  }, [])

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (useKinex.getState().status.kind !== 'thinking') saveWorkspace(); return }
      if (typing(document.activeElement) || document.querySelector('dialog[open]') || event.metaKey || event.ctrlKey || event.altKey) return
      const state = useKinex.getState()
      const key = event.key.toLowerCase()
      if (key === 'escape') { if (state.inspectId) exitInspect(); else setFocus(false); setToolsOpen(false) }
      if (key === 'f') { setFocus((value) => !value); setToolsOpen(false) }
      if (state.status.kind === 'thinking') return
      if (state.inspectId) {
        if (key === 'x' || key === 'y' || key === 'z') rotateModel(key, event.shiftKey ? -15 : 15)
      } else {
        const target = state.hoverId || state.lastId
        if ((key === 'delete' || key === 'backspace') && target) { event.preventDefault(); state.removeObject(target) }
        if (key === 'i' && target) enterInspect(target)
      }
      if (key === 'm') toggleListening()
      if (event.key === '/') { event.preventDefault(); document.getElementById('kinex-input')?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const requestNew = () => objects.length ? setNewWorld(true) : newWorkspace()
  const enterInspection = () => {
    const state = useKinex.getState()
    const id = state.lastId || state.objects.at(-1)?.id
    if (id) enterInspect(id)
  }

  return <main className={`studio-shell ${focus ? 'focus-mode' : ''} ${toolsOpen ? 'tools-open' : ''}`}>
    <header className="studio-header">
      <div className="brand"><span className="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="m7 5 9 7-9 7V5Zm11 8 9 7-9 7V13Z" fill="currentColor"/></svg></span><h1>kinex<span>STUDIO</span></h1></div>
      <div className="project-heading"><span className="project-slash">/</span><label className="sr-only" htmlFor="project-name">World name</label><input id="project-name" value={projectName} maxLength="60" onChange={(event) => useKinex.getState().set({ projectName: event.target.value })} onBlur={() => { if (!projectName.trim()) useKinex.getState().set({ projectName: 'Untitled world' }) }}/><span className="save-indicator" title={saveState === 'saved' ? 'Saved on this device, including imported models' : saveState === 'error' ? 'Browser storage is unavailable. Export your world to keep it.' : 'Saving on this device'}><Icon name={saveState === 'saved' ? 'check' : saveState === 'error' ? 'help' : 'clock'} size={12}/>{saveState === 'saved' ? 'Saved locally' : saveState === 'error' ? 'Session only' : 'Saving'}</span></div>
      <div className="header-actions"><span className="connection-pill"><span className={hasLLM ? 'status-dot' : 'status-dot offline'}/>{hasLLM ? 'AI connected' : 'Basic mode'}</span><button className="icon-button" data-hand onClick={() => setGuide(true)} title="Gestures and keyboard shortcuts" aria-label="Open quick guide"><Icon name="help"/></button><button className="button button-quiet import-button" data-hand onClick={() => file.current.click()} disabled={thinking}><Icon name="upload" size={15}/><span>Import</span></button><button className="button button-primary export-button" data-hand onClick={exportNow} disabled={!objects.length || thinking}><Icon name="download" size={15}/><span>Export world</span></button></div>
      <input ref={file} type="file" multiple accept={IMPORT_EXTENSIONS.map((extension) => `.${extension}`).join(',')} className="sr-only" tabIndex="-1" aria-label="Import 3D models" onChange={(event) => { const files = [...event.target.files]; event.target.value = ''; files.reduce((promise, item) => promise.then(() => importModelFile(item)), Promise.resolve()) }}/>
    </header>

    <div className="workspace-content">
      <button className="sidebar-scrim" aria-label="Close tools" aria-hidden={!toolsOpen} onClick={() => setToolsOpen(false)} tabIndex={toolsOpen ? 0 : -1}/>
      <Sidebar onClose={() => setToolsOpen(false)} onNew={requestNew} onGuide={() => setGuide(true)} inert={compact && !toolsOpen}/>
      <section className="viewport-shell" aria-label="3D workspace">
        <div className="viewport-toolbar"><div className="workspace-mode"><button className="mobile-only toolbar-icon" data-hand aria-label="Open creation tools" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}><Icon name="menu" size={17}/></button><span className="mode-dot"/><button data-hand className={!inspecting ? 'active' : ''} onClick={exitInspect}>World</button><span>/</span><button data-hand className={inspecting ? 'active' : ''} onClick={enterInspection} disabled={!objects.length || thinking}>Inspect</button></div><div className="viewport-tools"><SceneControls/><span className="toolbar-divider"/><button data-hand className="toolbar-icon" title="Reset perspective" aria-label="Reset perspective" onClick={() => snapView('iso')}><Icon name="target" size={17}/></button><button data-hand className="toolbar-icon focus-toggle" title={focus ? 'Exit focus mode (F)' : 'Focus mode (F)'} aria-label={focus ? 'Exit focus mode' : 'Enter focus mode'} aria-pressed={focus} onClick={() => setFocus(!focus)}><Icon name={focus ? 'collapse' : 'expand'} size={17}/></button></div></div>
        <div className="scene-viewport" data-inspecting={inspecting}>
          <Stage/>
          <div className="viewport-vignette" aria-hidden="true"/>
          <div className="canvas-heading"><span className="eyebrow">{inspecting ? 'A CLOSER LOOK' : 'A SPACE FOR YOUR IMAGINATION'}</span><p>{inspecting ? 'Every angle. Every little detail.' : 'Make something that didn’t exist a moment ago.'}</p></div>
          <InteractionTools/>
          <CameraPiP onGuide={() => setGuide(true)}/>
          <div className="viewport-hint"><Icon name="orbit" size={14}/><span>Drag to orbit<span className="hint-separator">·</span>Scroll to explore</span></div>
          <AxisGizmo/>
          <HDTray/>
          {!ready && <div className="workspace-loading"><span className="loading-spinner"/><p>Opening your world…</p></div>}
          {ready && !objects.length && <div className="empty-world"><span className="empty-world-icon"><Icon name="spark" size={28}/></span><p>What’s on your mind?</p><span>Give your imagination a place to land.</span><button data-hand className="button button-primary" onClick={() => document.getElementById('kinex-input')?.focus()}>Describe your first creation<Icon name="arrow" size={15}/></button></div>}
          <section className="command-area" aria-label="Create with AI"><Subtitle/><CommandBar/></section>
          <div className="viewport-edition"><span/>KINEX SPATIAL STUDIO<span>01</span></div>
        </div>
      </section>
    </div>
    <footer className="studio-statusbar"><div><span className="statusbar-dot"/><span>{String(objects.length).padStart(2, '0')} objects</span><span className="statusbar-divider"/><span>{objects.reduce((sum, object) => sum + object.parts.length, 0)} parts</span><span className="statusbar-divider"/><span>{hands ? `${hands} ${hands === 1 ? 'hand' : 'hands'} tracking` : 'Mouse & keyboard ready'}</span></div><div><span>{thinking ? 'Building your world' : status.kind === 'listening' ? 'Listening to your idea' : 'A little imagination goes a long way.'}</span><button data-hand className="quality-control" aria-label="High quality rendering" aria-pressed={highQuality} onClick={() => useKinex.getState().set({ renderQuality: highQuality ? 'balanced' : 'high' })}><Icon name="settings" size={11}/>{highQuality ? 'High quality' : 'Balanced'}</button><kbd>/</kbd><span>to create</span></div></footer>
    {dragging && <div className="drop-overlay"><Icon name="upload" size={44}/><h2>Drop it into your world.</h2><p>GLB, GLTF, OBJ or STL</p></div>}
    {guide && <Guide onClose={() => setGuide(false)}/>}
    {newWorld && <Modal title="Make room for a new idea?" onClose={() => setNewWorld(false)}><p className="modal-intro">Starting a new world replaces this scene and its local save. Export it first if you’d like to keep it.</p><div className="modal-actions"><button data-hand className="button button-secondary" onClick={() => setNewWorld(false)}>Keep this world</button><button data-hand className="button button-primary" onClick={() => { newWorkspace(); setNewWorld(false); setToolsOpen(false) }}>Start fresh<Icon name="plus" size={15}/></button></div></Modal>}
    <HandCursors/>
  </main>
}
