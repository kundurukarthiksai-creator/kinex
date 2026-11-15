# Kinex Studio

Create a 3D world with words. Reach in and make it yours.

A browser spatial playground for **Sunhacks 9.0**: conversational scene creation, webcam hand controls, detailed local meshes, editable primitive models, 3D-file import, and a focused studio interface. This fork develops the studio experience separately from the [original Kinex project](https://github.com/kundurukarthiksai-creator/kinex).

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

Without a chat key, the local model library, curated starters, basic shapes, undo/redo, color and material changes, rotation and environment controls still work. Custom AI shapes and photo reconstruction require a compatible AI service. Browser speech recognition may itself require the browser’s online service.

## Studio experience

- **Instant starters:** orbital playground, robot companion, solar system, and a small architectural scene. The first visit opens a working playground.
- **Detailed model library:** a Kinex-authored cruise ship with a curved hull, passenger decks, windows, rails, lifeboats and eight color sections, plus locally bundled textured avocado, bottle and speaker assets. Model cards work without an AI request and open an inspection view that fits the model on desktop and mobile.
- **Independent colors:** Coastal, Ocean and Coral ship palettes, section swatches, or commands such as “make the hull red and windows blue.” Color edits are saved and exported in standard glTF materials. Textured assets use a color tint that preserves their texture.
- **Undo/redo:** toolbar controls, typed or spoken commands, and shortcuts. Each streamed AI build or continuous grab/resize is one edit; undo also restores live position, orientation, scale and model references. History retains the last 30 edits for this session.
- **Guided demo under More options:** a marine-design lesson, a buoyancy question and a guided 90-second presentation. The scene illustrates design; it does not simulate water or buoyancy.
- **A focused canvas:** the model and one prompt stay visible. **Models** opens the library; **Edit** opens controls for the selected model. Object management, lighting, imports, help and the guided demo are available under **More options**. There is no permanent sidebar or tab row.
- **Explicit Move and Rotate tools:** choose what a one-hand pinch does. Rotate works anywhere on the canvas for the selected object.
- **Local autosave:** world name, objects, live positions, orientations, lighting and render settings are saved in IndexedDB. Imported mesh assets are saved with the scene. The save indicator reports when browser storage is unavailable.
- **Camera control:** opt in, see the tracked skeleton, live gesture feedback and measured inference rate, and switch the webcam fully off. MediaPipe normally runs in a worker with a 24 fps ceiling and a 640px inference frame; this leaves the high-resolution video available for photo capture. Browsers without compatible workers use a main-thread fallback. Invalid landmarks are filtered, hand assignments minimize total movement, and brief detection gaps have a 200ms grace period.
- **Photo reconstruction:** preview and retake a still, then choose a quick build or a detailed reconstruction with up to 64 parts. Only the chosen still is sent to the AI.
- **Rendering:** smooth surfaces, softer shadows, environment reflections, restrained bloom and High quality/Balanced controls.
- **Fast, bounded commands:** common edits and simple recipes run locally. Custom AI requests stream parts, have an 18-second total budget (35 seconds for photos/refinement), and can be canceled. A failed connection enables a local fallback and a 30-second retry cooldown. Repeating a completed pure-creation request in the session reuses its cached AI plan. Partial geometry is retained and labeled if the stream stops.
- **Voice lifecycle:** interim text previews, one submission of final text per session, clear microphone/network errors, retry support and cancellation of stale events.
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
| `Cmd/Ctrl + Z` | Undo a world edit (text inputs retain native text undo) |
| `Cmd/Ctrl + Shift + Z` or `Ctrl + Y` | Redo |
| `Cmd/Ctrl + S` | Save the current world locally |

## Photo detail and textured meshes

Gemini reconstructs a **shape approximation** using primitives. More detail improves the silhouette, proportions and recognizable features; a single photograph cannot recover exact unseen surfaces, text or textures.

The optional ASU Flux/Trellis image-to-mesh service is configured separately from chat:

```env
MESH_API_KEY=YOUR_ASU_API_KEY
MESH_BASE_URL=https://openai.rc.asu.edu/v1
```

When connected, **Make it HD** is available in Inspect mode. If chat already uses the ASU endpoint, its key is reused for this service unless a separate mesh key is supplied. A Gemini key is never sent to the ASU mesh service. Imported textured models work without this optional service.

## A 90-second educational demo

Open **More options → Guided demo → Start the guided demo**. Starting a lab replaces the world; Undo can restore it.

1. **0–15s:** create a realistic ship. Identify its curved hull, multiple passenger decks and lifeboats. This is an original deterministic Kinex mesh, loaded locally.
2. **15–40s:** ask “Create a detailed lighthouse with a red roof, white tower and yellow lamp.” Watch actual custom AI geometry assemble. An outage falls back to the local lighthouse recipe.
3. **40–65s:** select the ship and Rotate; enable hands, pinch thumb to index, drag and release. Then try a second hand to scale and twist in World mode.
4. **65–90s:** inspect the ship, change its hull/windows or pick a palette, undo a change, and show wireframe. Explain buoyancy using the question in Guided demo, then export the model.

Check camera and microphone permissions on the demo laptop before presenting. Keep mouse controls and the local ship ready if venue lighting or speech recognition is unreliable.

## Model provenance and limits

The ship is generated reproducibly from native Three.js geometry by `node scripts/models/build-ship.mjs`. It is the detailed passenger-ship design offered by Kinex; it is not newly inferred from every prompt or reference image. Its eight material sections support independent colors. Other supported library subjects resolve to existing textured GLB files bundled locally. Their Microsoft CC0-1.0 notices and pinned source checksums are in `public/models/`.

Novel subjects still use Gemini’s bounded primitive construction, and photo input still produces an approximation. Photorealistic arbitrary text-to-3D or accurate single-photo reconstruction needs a separate mesh-generation service; a chat API key alone does not provide it.

## Explaining Kinex to judges

See [the judge guide](docs/judge-guide.md) for a short pitch, a 90-second flow and direct answers about the technology, usefulness, model provenance and limitations.

## Development and verification

```bash
npm test
npm run build
npm run preview
```

Use Vite's dev or preview server for AI requests; a plain static server does not provide the credential proxy.

The app uses React, Vite, Three.js/React Three Fiber, Rapier, MediaPipe and a compatible streaming AI API. Hand tracking and cursor updates use a mutable frame loop rather than updating React every frame. Scene commands are validated and bounded before rendering. The tracker model and WASM are copied into `public/mediapipe` during installation, with CDN fallbacks.

Tests cover gesture recognition and hand continuity, partial JSON, scene actions, independent color parsing, detailed photo budgets, viewport coordinates, saved mesh appearance, atomic history, cancellation and voice lifecycle. Browser checks also exercise the studio workflow, camera lifecycle, actual Gemini calls, GLB round trips, saved mesh assets and mobile navigation.
