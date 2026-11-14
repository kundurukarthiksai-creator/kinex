import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// No StrictMode: it double-mounts effects, which would open the webcam twice.
createRoot(document.getElementById('root')).render(<App />)
