import { useEffect, useRef, useId } from 'react'
import { Icon } from './Icon.jsx'
import { HandCursors } from './HandCursors.jsx'

export function Modal({ title, children, onClose, className = '' }) {
  const dialog = useRef()
  const heading = useId()
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])
  return <dialog ref={dialog} className={`studio-modal ${className}`} aria-labelledby={heading} onCancel={(e) => { e.preventDefault(); onClose() }} onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div className="modal-content"><div className="modal-heading"><h2 id={heading}>{title}</h2><button data-hand className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button></div>{children}</div>
    <HandCursors/>
  </dialog>
}

const GESTURES = [
  ['01', 'Pinch to pick it up', 'Bring your thumb and index finger together over an object. Move your hand to move it.'],
  ['02', 'Turn it every which way', 'Choose Rotate, then pinch and drag anywhere on the canvas. In Move mode, add a second pinch to your grabbed object: spread to resize, twist to rotate.'],
  ['03', 'Let go. Let it fly.', 'Release your pinch while moving to throw. Hold a fist over an object to crush it.'],
  ['04', 'A peace sign starts a conversation', 'Hold two fingers up to turn on the microphone. Say what you want to create or change.'],
]

export function Guide({ onClose }) {
  return <Modal title="A world at your fingertips." onClose={onClose} className="guide-modal">
    <p className="modal-intro">An idea is all you need. Create with words, then reach in and play.</p>
    <div className="guide-flow"><span><Icon name="spark"/>Describe</span><Icon name="arrow" size={15}/><span><Icon name="cube"/>Create</span><Icon name="arrow" size={15}/><span><Icon name="hand"/>Interact</span></div>
    <div className="gesture-steps">{GESTURES.map(([number, name, description]) => <div key={number}><span>{number}</span><section><h3>{name}</h3><p>{description}</p></section></div>)}</div>
    <div className="keyboard-guide"><h3>A keyboard works, too.</h3><div>{[['/', 'Focus prompt'], ['M', 'Microphone'], ['I', 'Inspect object'], ['Esc', 'Back to world'], ['F', 'Focus mode'], ['Del', 'Delete selected']].map(([key, label]) => <span key={key}><kbd>{key}</kbd>{label}</span>)}</div><p>Drag an object to grab it. Drag empty space to orbit. Scroll to zoom.</p></div>
    <button className="button button-primary guide-done" data-hand onClick={onClose}>Let’s make something<Icon name="arrow" size={16}/></button>
  </Modal>
}
