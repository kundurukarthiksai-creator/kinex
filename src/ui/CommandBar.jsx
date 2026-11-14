import { useRef, useState } from 'react'
import { useKinex } from '../store.js'
import { runCommand, summon, exportNow } from '../ai/commands.js'
import { toggleListening, hasSpeech } from '../voice/speech.js'

const IDEAS = ['a castle with a red flag', 'a solar system', 'a robot with glowing eyes', 'a rocket ready for launch']

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  )
}

export function CommandBar() {
  const [text, setText] = useState('')
  const input = useRef()
  const listening = useKinex((s) => s.listening)
  const thinking = useKinex((s) => s.status.kind === 'thinking')
  const empty = useKinex((s) => s.objects.length === 0)
  const camera = useKinex((s) => s.camera)
  const scanning = useKinex((s) => s.scanning)

  const send = (value) => {
    const v = value.trim()
    if (!v) return
    runCommand(v)
    setText('')
  }

  return (
    <div className="flex w-full max-w-[720px] flex-col gap-3">
      {empty && !thinking && (
        <div className="flex flex-wrap gap-2" aria-label="Ideas to try">
          {IDEAS.map((idea) => (
            <button
              key={idea}
              data-hand
              onClick={() => send(idea)}
              className="panel rounded-full px-4 py-2 text-[15px] font-medium text-ink hover:bg-white"
            >
              {idea}
            </button>
          ))}
        </div>
      )}
      <form
        className="panel flex items-center gap-2 rounded-[22px] p-2 shadow-[0_10px_40px_-12px_rgba(35,38,58,0.35)] focus-within:border-cobalt"
        onSubmit={(e) => {
          e.preventDefault()
          send(text)
        }}
      >
        <button
          type="button"
          data-hand
          onClick={toggleListening}
          aria-pressed={listening}
          aria-label={listening ? 'Stop listening' : 'Talk'}
          title={hasSpeech ? 'Talk (or hold a peace sign)' : 'Voice needs Chrome or Edge'}
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-colors ${
            listening ? 'bg-cobalt text-white' : 'bg-white text-ink hover:bg-cyc'
          }`}
        >
          <MicIcon />
        </button>
        <label className="sr-only" htmlFor="kinex-input">
          Describe something to build
        </label>
        <input
          id="kinex-input"
          ref={input}
          data-hand
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && input.current.blur()}
          placeholder="Describe something to build"
          autoComplete="off"
          className="h-12 min-w-0 flex-1 bg-transparent px-2 text-lg text-ink outline-none placeholder:text-muted/70"
        />
        <button
          type="button"
          data-hand
          onClick={summon}
          disabled={camera !== 'on' || scanning}
          className="h-12 shrink-0 rounded-2xl bg-ink px-4 font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {scanning ? 'Scanning' : 'Summon from camera'}
        </button>
        <button
          type="button"
          data-hand
          onClick={exportNow}
          disabled={empty}
          className="hidden h-12 shrink-0 rounded-2xl px-3 font-medium text-ink hover:bg-white disabled:opacity-40 md:block"
          title="Download your world as a .glb file"
        >
          Export
        </button>
      </form>
    </div>
  )
}
