import { useEffect, useRef, useState } from 'react'
import { useKinex } from '../store.js'
import { tracker, startTracker, stopTracker } from '../vision/handTracker.js'
import { Icon } from './Icon.jsx'

const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]]
const MODE_COLOR = { grab: '#FFB578', rotate: '#B5A6FF', stretch: '#FFB578', crush: '#F2838B' }

export function CameraPiP({ onGuide }) {
  const video = useRef()
  const canvas = useRef()
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 1100px)').matches)
  const camera = useKinex((s) => s.camera)
  const cameraError = useKinex((s) => s.cameraError)
  const scanning = useKinex((s) => s.scanning)
  const gestures = useKinex((s) => s.gestures)
  const handsSeen = useKinex((s) => s.handsSeen)
  const inspecting = useKinex((s) => Boolean(s.inspectId))
  const handTool = useKinex((s) => s.handTool)
  useEffect(() => () => stopTracker(), [])
  useEffect(() => {
    if (camera !== 'on' || collapsed) return
    let frame
    const draw = () => {
      frame = requestAnimationFrame(draw)
      const c = canvas.current
      if (!c) return
      const ctx = c.getContext('2d')
      ctx.clearRect(0, 0, c.width, c.height)
      for (const hand of tracker.hands) {
        if (!hand.present) continue
        ctx.strokeStyle = MODE_COLOR[hand.mode] || '#74E4DA'
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.beginPath()
        for (const [a, b] of BONES) { ctx.moveTo(hand.lm[a].x*c.width, hand.lm[a].y*c.height); ctx.lineTo(hand.lm[b].x*c.width, hand.lm[b].y*c.height) }
        ctx.stroke()
        ctx.fillStyle = '#FFFFFF'
        for (const point of hand.lm) { ctx.beginPath(); ctx.arc(point.x*c.width, point.y*c.height, 2.2, 0, Math.PI*2); ctx.fill() }
      }
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [camera, collapsed])
  const active = camera === 'on'
  const two = handsSeen === 2 && gestures.every((gesture) => gesture === 'pinch')
  const feedback = !handsSeen ? 'Keep a hand in view to begin.' : two ? 'Spread to resize. Twist to turn.' : gestures.includes('pinch') ? inspecting || handTool === 'rotate' ? 'Move your pinched hand to rotate.' : 'Keep pinching to move your object.' : gestures.includes('fist') && handTool === 'rotate' ? 'Relax your fingers, then touch thumb to index.' : 'Touch thumb to index finger to pinch.'
  const modes = [
    ['pinch', inspecting || handTool === 'rotate' ? 'Pinch & drag' : 'Pinch', inspecting || handTool === 'rotate' ? 'Rotate in 3D' : 'Grab & move', inspecting || handTool === 'rotate' ? 'orbit' : 'hand'],
    ['two', 'Two hands', inspecting ? 'Zoom & roll' : 'Scale & rotate', 'expand'],
    ['victory', 'Peace sign', 'Speak an idea', 'mic'],
  ]
  return <aside className={`camera-card ${collapsed ? 'collapsed' : ''}`} aria-label="Hand tracking">
    <div className="camera-heading"><span><Icon name="hand" size={14}/>HAND TRACKING</span><div><span className={`camera-live ${active ? 'online' : ''}`}><i/>{active ? 'LIVE' : 'OFF'}</span><button data-hand className="icon-button" aria-label={collapsed ? 'Expand camera panel' : 'Collapse camera panel'} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><Icon name="chevron" size={13}/></button></div></div>
    <div className="camera-body" hidden={collapsed}>
      <div className={`camera-preview ${active ? 'is-on' : ''}`}>
        <div className="camera-mirror"><video ref={video} muted playsInline/><canvas ref={canvas} width="320" height="240"/></div>
        {!active && <div className="camera-placeholder"><span className="camera-placeholder-icon"><Icon name="hand" size={27}/></span><h3>{camera === 'starting' ? 'Finding your hands…' : camera === 'denied' ? 'Camera access needed' : camera === 'error' ? 'Camera unavailable' : 'Reach into your world.'}</h3><p>{cameraError || 'Your webcam becomes your controller.'}</p><button data-hand className="button button-primary button-small" onClick={() => startTracker(video.current)} disabled={camera === 'starting'}>{camera === 'starting' ? <span className="loading-spinner"/> : <Icon name="camera" size={14}/>} {camera === 'starting' ? 'Connecting' : camera === 'off' ? 'Enable hands' : 'Try camera again'}</button></div>}
        {active && <><div className="camera-corner top-left"/><div className="camera-corner top-right"/><div className="camera-corner bottom-left"/><div className="camera-corner bottom-right"/><div className="camera-tracking-label"><span className={handsSeen ? 'tracking-dot' : 'tracking-dot waiting'}/>{handsSeen ? `${handsSeen} ${handsSeen === 1 ? 'hand' : 'hands'} detected` : 'Raise a hand to begin'}</div><button data-hand className="camera-stop" aria-label="Turn off camera" title="Turn off camera" onClick={stopTracker}><Icon name="cameraOff" size={14}/></button></>}
        {scanning && <div className="scanline"/>}
      </div>
      <div className="gesture-mini-list">{modes.map(([key,name,action,icon]) => <div key={key} className={(key === 'two' ? two : !two && gestures.includes(key)) ? 'gesture-active' : ''}><span className="gesture-mini-icon"><Icon name={icon} size={15}/></span><span><strong>{name}</strong><small>{action}</small></span><i/></div>)}</div>
      {active && <p className="gesture-feedback" role="status">{feedback}</p>}
      <button className="camera-guide-link" data-hand onClick={onGuide}>All gestures & shortcuts<Icon name="arrow" size={12}/></button>
      <p className="camera-privacy">Hand tracking stays on this device.<br/>Summon shares one photo when you choose it.</p>
    </div>
  </aside>
}
