import { useEffect, useRef, useState } from 'react'
import { useKinex } from '../store.js'
import { runCommand, summon } from '../ai/commands.js'
import { toggleListening, hasSpeech } from '../voice/speech.js'
import { enterInspect } from '../lib/viewer.js'
import { makeHD } from '../hd/meshes.js'

const IDEAS = ['a castle with a red flag', 'a vintage camera', 'a cozy two-story house', 'a robot with glowing eyes']
const FOLLOW_UPS = ['make it taller', 'add more windows', 'paint the roof blue', 'add detail']

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )
}

function Message({ m }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] leading-snug text-white">{m.text}</p>
      </div>
    )
  }
  return (
    <div className="max-w-[92%]">
      <p
        className={`text-[15px] leading-relaxed ${m.status === 'error' ? 'text-crush' : 'text-ink'} ${
          m.status === 'working' ? 'breathe' : ''
        }`}
      >
        {m.text}
      </p>
      {m.notes?.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5 text-sm text-muted">
          {m.notes.map((n, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className="inline-block h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full bg-cobalt/60" aria-hidden="true" />
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// The conversation: build something, then keep talking to it until it's right.
export function ChatPanel() {
  const chat = useKinex((s) => s.chat)
  const listening = useKinex((s) => s.listening)
  const subtitle = useKinex((s) => s.subtitle)
  const handsOn = useKinex((s) => s.handsOn)
  const scanning = useKinex((s) => s.scanning)
  const working = useKinex((s) => s.status.kind === 'thinking')
  const focus = useKinex((s) => s.objects.find((o) => o.id === (s.inspectId || s.lastId)) || s.objects.at(-1))
  const focusHD = useKinex((s) => (focus ? s.hd[focus.id]?.status : null))
  const inspecting = useKinex((s) => Boolean(s.inspectId))
  const set = useKinex((s) => s.set)
  const [text, setText] = useState('')
  const list = useRef()
  const input = useRef()

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [chat])

  const send = (value) => {
    const v = value.trim()
    if (!v) return
    runCommand(v)
    setText('')
  }

  return (
    <aside aria-label="Chat" className="flex h-full w-[min(400px,100vw)] shrink-0 flex-col border-l border-line bg-[#F3F4F8]">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight text-ink">Chat</h2>
          <p className="truncate text-sm text-muted">
            {focus ? (
              <>
                Working on the <span className="font-medium text-ink">{focus.name}</span>, {focus.parts.length} parts
              </>
            ) : (
              'Describe something to build'
            )}
          </p>
        </div>
        <button data-hand onClick={() => set({ chatOpen: false })} aria-label="Close chat" className="rounded-full px-2 py-1 text-muted hover:bg-white hover:text-ink">
          ✕
        </button>
      </div>

      {focus && (
        <div className="flex flex-wrap gap-2 border-b border-line px-4 py-2.5">
          {!inspecting && (
            <button data-hand onClick={() => enterInspect(focus.id)} className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-cyc">
              Inspect
            </button>
          )}
          {(!focusHD || focusHD === 'failed') && (
            <button
              data-hand
              onClick={() => makeHD(focus.id)}
              className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-cyc"
              title="Generate a real textured 3D model. Takes a few minutes."
            >
              Make it HD
            </button>
          )}
          <button
            data-hand
            onClick={() => send('add detail')}
            disabled={working}
            className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-cyc disabled:opacity-40"
          >
            Add detail
          </button>
        </div>
      )}

      <div ref={list} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {chat.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-[15px] leading-relaxed text-ink">
              Tell me what to build. Then keep talking to it: ask for taller towers, more windows, a different color, or more detail, and I'll
              change the same model.
            </p>
            <div className="flex flex-wrap gap-2">
              {IDEAS.map((idea) => (
                <button key={idea} data-hand onClick={() => send(idea)} className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-cyc">
                  {idea}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.map((m) => (
          <Message key={m.id} m={m} />
        ))}
        {listening && <p className="text-[15px] italic text-muted">{subtitle.text || 'Listening…'}</p>}
      </div>

      {focus && !working && chat.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {FOLLOW_UPS.map((f) => (
            <button key={f} data-hand onClick={() => send(f)} className="rounded-full border border-line px-3 py-1 text-sm text-muted hover:bg-white hover:text-ink">
              {f}
            </button>
          ))}
        </div>
      )}

      <form
        className="m-3 mt-1 flex items-end gap-2 rounded-2xl border border-line bg-white p-2 focus-within:border-cobalt"
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
          title={hasSpeech ? 'Talk' : 'Voice needs Chrome or Edge'}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors ${listening ? 'bg-cobalt text-white' : 'text-ink hover:bg-cyc'}`}
        >
          <MicIcon />
        </button>
        <label htmlFor="kinex-input" className="sr-only">
          Message
        </label>
        <textarea
          id="kinex-input"
          ref={input}
          data-hand
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(text)
            }
            if (e.key === 'Escape') input.current.blur()
          }}
          placeholder={focus ? `Change the ${focus.name}, or build something new` : 'Describe something to build'}
          className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] text-ink outline-none placeholder:text-muted/70"
        />
        <button
          type="submit"
          data-hand
          disabled={!text.trim()}
          aria-label="Send"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-white transition-opacity disabled:opacity-30"
        >
          <SendIcon />
        </button>
      </form>
      {handsOn && (
        <button
          data-hand
          onClick={summon}
          disabled={scanning}
          className="mx-3 mb-3 -mt-1 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink hover:bg-white disabled:opacity-40"
        >
          {scanning ? 'Looking at your object…' : 'Summon from camera: hold an object up and build a copy'}
        </button>
      )}
    </aside>
  )
}
