import { useKinex } from '../store.js'
import { Icon } from './Icon.jsx'

export function InteractionTools() {
  const tool = useKinex((state) => state.handTool)
  const inspecting = useKinex((state) => Boolean(state.inspectId))
  const selected = useKinex((state) => state.objects.find((object) => object.id === state.lastId)?.name)
  return <div className="interaction-tools" aria-label="Interaction mode">
    {!inspecting && <div className="interaction-segments" role="group" aria-label="Hand and mouse tools">
      <button data-hand aria-pressed={tool === 'move'} onClick={() => useKinex.getState().set({ handTool: 'move' })}><Icon name="hand" size={14}/>Move</button>
      <button data-hand aria-pressed={tool === 'rotate'} onClick={() => useKinex.getState().set({ handTool: 'rotate' })}><Icon name="orbit" size={15}/>Rotate</button>
    </div>}
    <p>{inspecting ? 'Pinch & drag to rotate. Two hands to zoom.' : tool === 'rotate' ? 'Pinch & drag anywhere to turn your selection.' : 'Pinch to grab. Add a second hand to scale & twist.'}</p>
    {!inspecting && tool === 'rotate' && selected && <span className="rotation-selection"><span/>{selected}</span>}
  </div>
}
