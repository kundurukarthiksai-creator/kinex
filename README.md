# Kinex Studio

Create a 3D world with words. Reach in and make it yours.

A browser spatial playground for **Sunhacks 9.0**: conversational scene creation, webcam hand controls, editable primitive models, 3D-file import, and a focused studio interface. This fork develops the studio experience separately from the [original Kinex project](https://github.com/kundurukarthiksai-creator/kinex).

## Run locally

Use Node.js 22.12 or later.

```bash
npm ci
cp .env.example .env
npm run dev
```

Open the local URL printed by Vite in Chrome or Edge. The webcam starts only when you choose **Enable hands**. Mouse and keyboard controls also work.

For Gemini, put these settings in the ignored `.env` file:

```env
OPENAI_API_KEY=YOUR_GEMINI_API_KEY
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
OPENAI_MODEL=gemini-3.5-flash-lite
```

`OPENAI_API_KEY` is the variable name used by the compatible client; the key above belongs to Gemini. The local server forwards requests to the configured provider and adds its key. Credentials are not included in browser assets. Restart the server after changing credentials.

The ASU compatible chat endpoint remains supported. Use its own key with `OPENAI_BASE_URL=https://openai.rc.asu.edu/v1` and an available model such as `qwen38-27b`.

Without a chat key, curated starter scenes and the basic offline builder still work. Full prompt and photo reconstruction require a compatible AI service.

## Studio experience

- **Instant starters:** orbital playground, robot companion, solar system, and a small architectural scene. The first visit opens a working playground.
- **Create and Scene panels:** explore prompts, select objects, scale, duplicate, delete, or inspect them.
- **Explicit Move and Rotate tools:** choose what a one-hand pinch does. Rotate works anywhere on the canvas for the selected object.
- **Local autosave:** world name, objects, live positions, orientations, lighting and render settings are saved in IndexedDB. Imported mesh assets are saved with the scene. The save indicator reports when browser storage is unavailable.
- **Camera control:** opt in, see the tracked skeleton and gesture hints, and switch the webcam fully off.
- **Photo reconstruction:** preview and retake a still, then choose a quick build or a detailed reconstruction with up to 64 parts. Only the chosen still is sent to the AI.
- **Rendering:** smooth surfaces, softer shadows, environment reflections, restrained bloom and High quality/Balanced controls.
- **Responsive workspace:** a tools drawer on small screens, a focus mode for demonstrations, and a keyboard-accessible guide.
- **Import and export:** open GLB, embedded GLTF, OBJ and STL models; export the world or inspected model as a binary GLB.

The local save is specific to this browser and origin. Use Export to keep a portable copy. Camera reference photos are excluded from automatic project saves.

## Hand controls

| Tool or gesture | Action |
| --- | --- |
| Move + pinch over an object | Grab and move it; move toward the camera to bring it closer. |
| Release a moving grab | Throw the object. |
| Add a second pinch while holding an object | Join the same object, even from empty canvas. Spread to resize and twist to rotate. |
| Rotate + pinch and drag | Turn the selected object freely on all three axes. Its orientation stays after release. |
| Inspect + pinch and drag | Rotate the isolated model. Two hands zoom and roll it. |
| Hold a fist in Move mode | Crush the hovered object. |
| Hold a peace sign | Start or stop voice input. |
| Pinch a control | Activate its button. |

Keep the hand in view and touch thumb to index finger for a pinch. The camera skeleton and highlighted gesture rows show what tracking recognizes.

Mouse: drag an object in Move mode to grab it, use Rotate to turn the selection, drag empty space to orbit, and scroll to zoom. In Move mode, scroll while holding an object to push or pull it.

| Key | Action |
| --- | --- |
| `/` | Focus the creation prompt |
| `M` | Start/stop voice input |
| `I` | Inspect the selected or hovered object |
| `Escape` | Exit Inspect, focus mode, or a dialog |
| `F` | Toggle focus mode |
| `Delete` / `Backspace` | Delete the selected or hovered object |
| `X`, `Y`, `Z` in Inspect | Turn 15 degrees; Shift reverses the turn |
| `Cmd/Ctrl + S` | Save the current world locally |

## Photo detail and textured meshes

Gemini reconstructs a **shape approximation** using primitives. More detail improves the silhouette, proportions and recognizable features; a single photograph cannot recover exact unseen surfaces, text or textures.

The optional ASU Flux/Trellis image-to-mesh service is configured separately from chat:

```env
MESH_API_KEY=YOUR_ASU_API_KEY
MESH_BASE_URL=https://openai.rc.asu.edu/v1
```

When connected, **Make it HD** is available in Inspect mode. If chat already uses the ASU endpoint, its key is reused for this service unless a separate mesh key is supplied. A Gemini key is never sent to the ASU mesh service. Imported textured models work without this optional service.

## A short demo

1. Open the orbital playground and enable hands.
2. Select Rotate, pinch, and turn the sculpture. Release: it keeps its orientation.
3. Return to Move. Pick up an object; add a second hand to stretch and twist it.
4. Describe “a castle with four towers and a red flag” and watch it assemble.
5. Inspect it, change the view, explode its parts, or ask for more detail.
6. Hold up a real object, preview its photo, and create a 3D approximation.
7. Switch lighting, try zero gravity, and export the world.

## Development and verification

```bash
npm test
npm run build
npm run preview
```

Use Vite's dev or preview server for AI requests; a plain static server does not provide the credential proxy.

The app uses React, Vite, Three.js/React Three Fiber, Rapier, MediaPipe and a compatible streaming AI API. Hand tracking and cursor updates use a mutable frame loop rather than updating React every frame. Scene commands are validated and bounded before rendering. The tracker model and WASM are copied into `public/mediapipe` during installation, with CDN fallbacks.

Tests cover gesture recognition, partial JSON, scene actions, detailed photo part budgets, viewport coordinate mapping, saved worlds and committed hand rotations. Browser checks also exercise the studio workflow, camera lifecycle, actual Gemini calls, GLB round trips, saved mesh assets and mobile navigation.
