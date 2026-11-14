import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // GEMINI_API / GEMINI_MODEL from .env are readable as import.meta.env.GEMINI_*
  envPrefix: ['VITE_', 'GEMINI_'],
  test: { environment: 'node' },
})
