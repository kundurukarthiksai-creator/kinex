import { useEffect, useState } from 'react'
import { useKinex } from '../store.js'

// What you said, set big enough to read from the back of the room.
export function Subtitle() {
  const subtitle = useKinex((s) => s.subtitle)
  const status = useKinex((s) => s.status)
  const narration = useKinex((s) => s.narration)
  const [fresh, setFresh] = useState(false)

  useEffect(() => {
    if (status.kind === 'thinking' || status.kind === 'listening') {
      setFresh(true)
      return
    }
    setFresh(true)
    const t = setTimeout(() => setFresh(false), 9000)
    return () => clearTimeout(t)
  }, [subtitle, status, narration])

  const note =
    status.kind === 'thinking'
      ? `${status.text || 'Building'}…`
      : status.kind === 'listening'
        ? 'Listening. Say what to build.'
        : status.kind === 'error'
          ? status.text
          : narration

  const show = fresh && (subtitle.text || note)
  return (
    <div
      className={`transition-opacity duration-500 ${show ? 'opacity-100' : 'opacity-0'}`}
      aria-live="polite"
    >
      {subtitle.text && (
        <p className="subtitle" data-interim={subtitle.interim}>
          {subtitle.text}
        </p>
      )}
      {note && (
        <p
          className={`mt-3 max-w-[48ch] text-lg font-medium ${status.kind === 'error' ? 'text-crush' : 'stage-note'} ${
            status.kind === 'thinking' || status.kind === 'listening' ? 'breathe' : ''
          }`}
        >
          {note}
        </p>
      )}
    </div>
  )
}
