import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { useKinex } from './store.js'
import { buildObject } from './ai/apply.js'
import './styles.css'

// Dev-only handle for scripted testing (e.g. loading saved models into the scene).
if (import.meta.env.DEV) window.__kinex = { useKinex, buildObject }

// No StrictMode: it double-mounts effects, which would open the webcam twice.
createRoot(document.getElementById('root')).render(<App />)
