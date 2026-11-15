import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const key = env.OPENAI_API_KEY || ''
  const base = new URL(env.OPENAI_BASE_URL || 'https://openai.rc.asu.edu/v1')
  const provider = base.hostname === 'generativelanguage.googleapis.com' ? 'gemini' : 'compatible'
  const meshKey = env.MESH_API_KEY || (base.hostname === 'openai.rc.asu.edu' ? key : '')
  const meshBase = new URL(env.MESH_BASE_URL || 'https://openai.rc.asu.edu/v1')

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
    '/mesh-api': {
      target: meshBase.origin,
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/mesh-api/, ''),
      headers: meshKey ? { Authorization: `Bearer ${meshKey}` } : {},
    },
  }

  return {
    plugins: [react(), tailwindcss()],
    define: {
      __LLM_READY__: JSON.stringify(Boolean(key)),
      __LLM_BASE__: JSON.stringify(`/llm${base.pathname.replace(/\/$/, '')}`),
      __LLM_MODEL__: JSON.stringify(env.OPENAI_MODEL || ''),
      __LLM_PROVIDER__: JSON.stringify(provider),
      __MESH_READY__: JSON.stringify(Boolean(meshKey)),
      __MESH_BASE__: JSON.stringify(`/mesh-api${meshBase.pathname.replace(/\/$/, '')}`),
    },
    server: { proxy },
    preview: { proxy },
    test: { environment: 'node' },
  }
})
