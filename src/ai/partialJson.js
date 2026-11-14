// Parses a JSON object that is still being streamed: cuts back to the last fully
// closed value and closes whatever brackets are still open.
export function parsePartial(text) {
  let s = String(text || '')
  if (/<think>/i.test(s)) {
    const end = s.search(/<\/think>/i)
    if (end < 0) return null // still reasoning
    s = s.slice(end + 8)
  }
  const start = s.indexOf('{')
  if (start < 0) return null
  s = s.slice(start)

  let inStr = false
  let esc = false
  const stack = []
  let cut = -1
  let cutStack = null
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{' || c === '[') stack.push(c)
    else if (c === '}' || c === ']') {
      stack.pop()
      cut = i + 1
      cutStack = stack.slice()
      if (!stack.length) break
    }
  }
  if (cut < 0) return null
  const closers = cutStack
    .reverse()
    .map((c) => (c === '{' ? '}' : ']'))
    .join('')
  try {
    return JSON.parse(s.slice(0, cut) + closers)
  } catch {
    return null
  }
}
