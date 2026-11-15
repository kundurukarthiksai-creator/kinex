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
import { HDTray } from './ui/HDTray.jsx'
import { Sidebar } from './ui/Sidebar.jsx'
import { Icon } from './ui/Icon.jsx'
import { Guide, Modal } from './ui/Guide.jsx'
import { importModelFile, IMPORT_EXTENSIONS } from './hd/importModel.js'
import { enterInspect, exitInspect, rotateModel, snapView } from './lib/viewer.js'
import { initializeWorkspace, saveWorkspace } from './lib/workspace.js'
import { newWorkspace } from './lib/starters.js'
import { HistoryControls } from './ui/HistoryControls.jsx'
import { undoWorld, redoWorld } from './lib/history.js'
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
  const aiState = useKinex((s) => s.aiState)
  const highQuality = useKinex((s) => s.renderQuality === 'high')
  const [dragging, setDragging] = useState(false)
  const [guide, setGuide] = useState(false)
  const [newWorld, setNewWorld] = useState(false)
  const [focus, setFocus] = useState(false)
  const [panel, setPanel] = useState(null)
  const selectedId = useKinex(s=>s.inspectId||s.lastId)
  const selected = objects.find(o=>o.id===selectedId) || objects.at(-1)
  const file = useRef()
  const thinking = status.kind === 'thinking'

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
      if ((event.metaKey || event.ctrlKey) && !typing(document.activeElement) && !document.querySelector('dialog[open]')) {
        const key = event.key.toLowerCase()
        if (key === 'z' || key === 'y') { event.preventDefault(); if (key === 'y' || event.shiftKey) redoWorld(); else undoWorld(); return }
      }
      if (typing(document.activeElement) || document.querySelector('dialog[open]') || event.metaKey || event.ctrlKey || event.altKey) return
      const state = useKinex.getState()
      const key = event.key.toLowerCase()
      if (key === 'escape') { if (state.inspectId) exitInspect(); else setFocus(false); setPanel(null) }
      if (key === 'f') { setFocus((value) => !value); setPanel(null) }
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

  const titles = { models:'Choose a model', objects:'Your objects', edit:'Edit model', demo:'Guided demo', menu:'Workspace', settings:'Lighting & view' }
  const openPanel = (name) => { setPanel(name); setFocus(false) }

  return <main className={`studio-shell simple-studio ${focus ? 'focus-mode' : ''}`}>
    <header className="studio-header">
      <div className="brand"><span className="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="m7 5 9 7-9 7V5Zm11 8 9 7-9 7V13Z" fill="currentColor"/></svg></span><h1>kinex</h1></div>
      <div className="project-heading"><label className="sr-only" htmlFor="project-name">World name</label><input id="project-name" value={projectName} maxLength="60" onChange={e=>useKinex.getState().set({projectName:e.target.value})} onBlur={()=>{if(!projectName.trim())useKinex.getState().set({projectName:'Untitled world'})}}/><span className="save-indicator" title={saveState==='error'?'Browser storage unavailable. Export to keep your work.':'Saved on this device'}><Icon name={saveState==='saved'?'check':saveState==='error'?'help':'clock'} size={12}/>{saveState==='saved'?'Saved':saveState==='error'?'Session only':'Saving'}</span></div>
      <div className="header-actions"><button data-hand className="button button-secondary model-picker-button" aria-label="Choose a model" onClick={()=>openPanel('models')}><Icon name="plus" size={16}/><span>Models</span></button><button data-hand className="button button-primary export-button" aria-label="Export world" onClick={exportNow} disabled={!objects.length||thinking}><Icon name="download" size={15}/><span>Export</span></button><button data-hand data-dialog-return className="icon-button workspace-menu-trigger" aria-label="More options" aria-haspopup="dialog" onClick={()=>openPanel('menu')}><Icon name="more" size={21} strokeWidth={3}/></button></div>
      <input ref={file} type="file" multiple accept={IMPORT_EXTENSIONS.map(ext=>`.${ext}`).join(',')} className="sr-only" tabIndex="-1" aria-label="Import 3D models" onChange={event=>{const files=[...event.target.files];event.target.value='';files.reduce((promise,item)=>promise.then(()=>importModelFile(item)),Promise.resolve())}}/>
    </header>
    <div className="workspace-content">
      <section className="viewport-shell" aria-label="3D workspace">
        <div className="scene-viewport" data-inspecting={inspecting}>
          <Stage/>
          <div className="viewport-vignette" aria-hidden="true"/>
          <div className="canvas-context">
            {inspecting&&<button data-hand className="back-to-world" onClick={exitInspect}><Icon name="arrowLeft" size={14}/>Back to world</button>}
            <div className="context-title"><span>{selected?.name || 'Your world'}</span>{selected&&<button data-hand className="context-edit" aria-label={`Edit ${selected.name}`} onClick={()=>openPanel('edit')}><Icon name="settings" size={14}/>Edit</button>}</div>
            {objects.length>1&&<button data-hand className="context-objects" onClick={()=>openPanel('objects')}>{objects.length} objects<Icon name="chevron" size={11}/></button>}
          </div>
          <CameraPiP onGuide={()=>setGuide(true)}/>
          {objects.length>0&&<div className="canvas-bottom-tools"><InteractionTools/>{!inspecting&&<button data-hand className="inspect-selection" disabled={thinking} onClick={enterInspection}><Icon name="inspect" size={15}/>Inspect</button>}</div>}
          <HDTray/>
          {!ready&&<div className="workspace-loading"><span className="loading-spinner"/><p>Opening your world…</p></div>}
          {ready&&!objects.length&&<div className="empty-world"><span className="empty-world-icon"><Icon name="spark" size={28}/></span><p>What would you like to explore?</p><span>Describe a model below, or choose one to begin.</span><button data-hand className="button button-primary" onClick={()=>openPanel('models')}>Choose a model<Icon name="arrow" size={15}/></button></div>}
          <section className="command-area" aria-label="Create with AI"><Subtitle/><CommandBar/></section>
          <div className="canvas-history"><HistoryControls/><button data-hand className="toolbar-icon" title="Help and gestures" aria-label="Open quick guide" onClick={()=>setGuide(true)}><Icon name="help" size={16}/></button></div>
        </div>
      </section>
    </div>
    {panel&&<Modal title={titles[panel]} onClose={()=>setPanel(null)} className="tool-drawer">
      {panel==='menu'?<div className="workspace-menu">
        <button data-hand onClick={()=>setPanel('objects')}><Icon name="layers"/><span>Objects<small>Select, resize or delete</small></span><Icon name="arrow" size={14}/></button>
        <button data-hand onClick={()=>setPanel('settings')}><Icon name="sun"/><span>Lighting & view<small>Environment and display settings</small></span><Icon name="arrow" size={14}/></button>
        <button data-hand onClick={()=>setPanel('demo')}><Icon name="play"/><span>Guided demo<small>A 90-second marine design lesson</small></span><Icon name="arrow" size={14}/></button>
        <button data-hand disabled={!objects.length||thinking} onClick={()=>{setPanel(null);exportNow()}}><Icon name="download"/><span>Export world</span></button>
        <button data-hand disabled={thinking} onClick={()=>{setPanel(null);file.current.click()}}><Icon name="upload"/><span>Import a 3D file</span></button>
        <button data-hand disabled={thinking} onClick={()=>{setPanel(null);requestNew()}}><Icon name="plus"/><span>New world</span></button>
        <button data-hand onClick={()=>{setPanel(null);setGuide(true)}}><Icon name="help"/><span>Help & gestures</span></button>
      </div>:panel==='settings'?<div className="view-settings"><p className="drawer-intro">Change the environment around your model.</p><label className="settings-name">World name<input value={projectName} maxLength={60} onChange={e=>useKinex.getState().set({projectName:e.target.value})}/></label><SceneControls expanded/><button data-hand className="button button-secondary" onClick={()=>{snapView('iso');setPanel(null)}}><Icon name="target" size={15}/>Reset perspective</button><button data-hand className="button button-secondary" aria-label="High quality rendering" aria-pressed={highQuality} onClick={()=>useKinex.getState().set({renderQuality:highQuality?'balanced':'high'})}><Icon name="settings" size={15}/>{highQuality?'High quality':'Balanced quality'}</button><button data-hand className="button button-secondary" onClick={()=>{setFocus(true);setPanel(null)}}><Icon name="expand" size={15}/>Focus mode</button><p className="model-color-hint">{!hasLLM||aiState==='offline'?'Local mode: models and common edits work without AI.':'AI is configured for custom requests.'} {hands?`${hands} hands detected.`:''}</p></div>:<Sidebar panel={panel} onClose={()=>setPanel(null)}/>}
    </Modal>}
    {focus&&<button data-hand className="exit-focus" onClick={()=>setFocus(false)}><Icon name="collapse" size={14}/>Exit focus</button>}
    {dragging&&<div className="drop-overlay"><Icon name="upload" size={44}/><h2>Drop a model into your world.</h2><p>GLB, GLTF, OBJ or STL</p></div>}
    {guide&&<Guide onClose={()=>setGuide(false)}/>}
    {newWorld&&<Modal title="Start a new world?" onClose={()=>setNewWorld(false)}><p className="modal-intro">This replaces your current scene. You can undo it or export a copy first.</p><div className="modal-actions"><button data-hand className="button button-secondary" onClick={()=>setNewWorld(false)}>Keep this world</button><button data-hand className="button button-primary" onClick={()=>{newWorkspace();setNewWorld(false)}}>Start fresh<Icon name="plus" size={15}/></button></div></Modal>}
    <HandCursors/>
  </main>
}
