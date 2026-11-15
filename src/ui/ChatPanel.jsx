import { useEffect, useRef, useState } from 'react'
import { useKinex } from '../store.js'
import { runCommand, summon, rateBuild } from '../ai/commands.js'
import { toggleListening, hasSpeech } from '../voice/speech.js'

const FOLLOW_UPS = ['make it taller', 'change the color to blue', 'add more detail', 'make it bigger']
const MODEL_IDEAS = ['hide the roof', 'how many windows are there?', 'make the exterior walls brick', 'undo']

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

// What a build was based on, and whether to keep it in the library.
function BuildFooter({ m }) {
  const [open, setOpen] = useState(false)
  const b = m.build
  return (
    <div className="mt-2 flex flex-col gap-2">
      {b.refs?.length > 0 && (
        <div className="text-sm">
          <button className="text-muted underline decoration-line underline-offset-2 hover:text-ink" onClick={() => setOpen(!open)} aria-expanded={open}>
            Built from {b.refs.length} similar model{b.refs.length === 1 ? '' : 's'}
          </button>
          {open && (
            <ol className="mt-1 list-decimal pl-5 text-muted">
              {b.refs.map((r, i) => (
                <li key={i} className="leading-snug">
                  {r}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {m.rated ? (
        <p className="text-sm text-muted">
          {m.rated === 'up' ? 'Saved to the library. Similar requests will start from this one.' : 'Noted. The models it was based on will show up less.'}
        </p>
      ) : (
        <div className="flex gap-2">
          <button
            data-hand
            onClick={() => rateBuild(m.id, true)}
            className="rounded-full border border-line bg-white px-3 py-1 text-sm font-medium text-ink hover:border-cobalt"
            title="Save this model so future builds learn from it"
          >
            👍 Keep this one
          </button>
          <button
            data-hand
            onClick={() => rateBuild(m.id, false)}
            className="rounded-full border border-line px-3 py-1 text-sm text-muted hover:bg-white hover:text-ink"
            title="Tell Kinex this missed"
          >
            👎 Not quite
          </button>
        </div>
      )}
    </div>
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
      <p className={`text-[15px] leading-relaxed ${m.status === 'error' ? 'text-crush' : 'text-ink'} ${m.status === 'working' ? 'breathe' : ''}`}>{m.text}</p>
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
      {m.build && m.status === 'done' && <BuildFooter m={m} />}
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
  const model = useKinex((s) => s.model)
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

  const suggestions = model ? MODEL_IDEAS : focus ? FOLLOW_UPS : []

  return (
    <aside aria-label="Chat" className="flex h-full w-[min(400px,100vw)] shrink-0 flex-col border-l border-line bg-[#F3F4F8]">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight text-ink">Chat</h2>
          <p className="truncate text-sm text-muted">
            {model ? (
              <>
                Working on <span className="font-medium text-ink">{model.name}</span>
              </>
            ) : focus ? (
              <>
                Working on the <span className="font-medium text-ink">{focus.name}</span>, {focus.parts.length} parts
              </>
            ) : (
              'Describe something and keep shaping it'
            )}
          </p>
        </div>
        <button data-hand onClick={() => set({ chatOpen: false })} aria-label="Close chat" className="rounded-full px-2 py-1 text-muted hover:bg-white hover:text-ink">
          ✕
        </button>
      </div>

      <div ref={list} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {chat.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-[15px] leading-relaxed text-ink">
              Tell me what to build. I start from the closest of thousands of reference models, then shape it to your request. Keep talking to change it:
              taller, another color, more detail.
            </p>
          </div>
        )}
        {chat.map((m) => (
          <Message key={m.id} m={m} />
        ))}
        {listening && <p className="text-[15px] italic text-muted">{subtitle.text || 'Listening…'}</p>}
      </div>

      {suggestions.length > 0 && !working && chat.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {suggestions.map((f) => (
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
          placeholder={model ? 'Ask about the model, or tell me what to change' : focus ? `Change the ${focus.name}, or describe something new` : 'Describe something to build'}
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
        <button data-hand onClick={summon} disabled={scanning} className="mx-3 mb-3 -mt-1 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink hover:bg-white disabled:opacity-40">
          {scanning ? 'Looking at your object…' : 'Summon from camera: hold an object up and build a copy'}
        </button>
      )}
    </aside>
  )
}
