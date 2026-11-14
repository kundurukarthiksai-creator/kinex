import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // OPENAI_API_KEY / OPENAI_MODEL / OPENAI_BASE_URL from .env are readable as import.meta.env.OPENAI_*
  envPrefix: ['VITE_', 'OPENAI_'],
  test: { environment: 'node' },
})
