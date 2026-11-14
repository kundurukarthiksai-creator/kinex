import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const key = env.OPENAI_API_KEY || ''
  const base = new URL(env.OPENAI_BASE_URL || 'https://openai.rc.asu.edu/v1')

  // The AI server doesn't allow browser requests (CORS), so the browser calls /llm on
  // this dev server and Vite forwards it, adding the key here. The key never ships to
  // the browser.
  const proxy = {
    '/llm': {
      target: base.origin,
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/llm/, ''),
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    },
  }

  return {
    plugins: [react(), tailwindcss()],
    define: {
      __LLM_READY__: JSON.stringify(Boolean(key)),
      __LLM_BASE__: JSON.stringify(`/llm${base.pathname.replace(/\/$/, '')}`),
      __LLM_MODEL__: JSON.stringify(env.OPENAI_MODEL || ''),
    },
    server: { proxy },
    preview: { proxy },
    test: { environment: 'node' },
  }
})
