import { useState } from 'react'
import { Modal } from './Guide.jsx'
import { Icon } from './Icon.jsx'
import { captureFrame } from '../lib/captureFrame.js'
import { summon } from '../ai/commands.js'
import { PHOTO_PARTS_LIMIT } from '../ai/schema.js'

export function CaptureDialog({ onClose }) {
  const [frame, setFrame] = useState(() => captureFrame())
  const [detail, setDetail] = useState('detailed')
  return <Modal title="From your hands to your world." onClose={onClose} className="capture-modal">
    <p className="modal-intro">Hold one object near the center in good light. Check the photo, then let AI reconstruct its shape.</p>
    <div className="capture-photo">{frame ? <img src={`data:image/jpeg;base64,${frame}`} alt="Camera photo to reconstruct in 3D"/> : <p>Enable your camera to capture an object.</p>}<span className="capture-frame-corner a"/><span className="capture-frame-corner b"/><span className="capture-frame-corner c"/><span className="capture-frame-corner d"/><span className="capture-photo-label"><Icon name="camera" size={12}/>REFERENCE PHOTO</span></div>
    <div className="capture-options" role="group" aria-label="Reconstruction detail">
      <button data-hand aria-pressed={detail === 'quick'} onClick={() => setDetail('quick')}><Icon name="cube" size={18}/><span><strong>Quick build</strong><small>A simpler, faster approximation.</small></span></button>
      <button data-hand aria-pressed={detail === 'detailed'} onClick={() => setDetail('detailed')}><Icon name="spark" size={18}/><span><strong>More detail</strong><small>Up to 64 carefully placed parts.</small></span></button>
    </div>
    <p className="capture-note">One photo is sent when you choose Create. This builds an editable shape approximation; unseen surfaces and textures won’t be exact.</p>
    <div className="modal-actions"><button className="button button-secondary" data-hand onClick={() => setFrame(captureFrame())}><Icon name="camera" size={15}/>Retake photo</button><button className="button button-primary" data-hand disabled={!frame} onClick={() => { summon({ frame, maxParts: detail === 'detailed' ? PHOTO_PARTS_LIMIT : 24 }); onClose() }}>Create in 3D<Icon name="arrow" size={15}/></button></div>
  </Modal>
}
