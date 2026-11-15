# Kinex

**Speak a world into existence, then sculpt it with your bare hands.**

Kinex runs in the browser with nothing but a webcam. You say what you want ("a castle with a red flag", "a solar system") and an LLM acts as an architect: it composes the object out of primitives and it assembles in front of you, piece by piece. Then you reach out and pinch it, throw it, stretch it with two hands, or crush it with your fist. Hold a real object up to the camera, say "summon this", and Kinex builds a 3D copy of it.

No headset. No mouse. No install.

## Run it

```bash
npm install          # also copies the hand-tracking model into /public for offline use
cp .env.example .env # then paste your key: OPENAI_API_KEY=...
npm run dev
```

Open http://localhost:5173 in **Chrome or Edge** (voice uses the Web Speech API). Allow the camera and microphone.

The AI runs on ASU's OpenAI-compatible server (`https://openai.rc.asu.edu/v1`, models `qwen38-27b` and `deepseek-v4-1-flash`). Any OpenAI-compatible server works: set `OPENAI_BASE_URL` and `OPENAI_MODEL`. The browser reaches the server through Vite's built-in proxy (`/llm`), which adds the key server-side, so run Kinex with `npm run dev` or `npm run preview`, not as static files. Without a key, Kinex falls back to an offline builder that knows a few shapes, so the demo never dies on bad Wi-Fi.

## How Kinex builds (and learns)

1. **Starts from proven designs.** Kinex ships with a library of 10,065 example models converted from BlendNet (Apache-2.0). Each request is matched by meaning (local `embeddinggemma` embeddings) to the closest models; a very close match appears instantly as a draft.
2. **Shapes them to your words.** A local model on your GPU (Ollama `qwen3.5:9b`, thinking off) gets the 3 best references and writes the final model part by part, streamed live. ASU's `gpt-oss-120b` is the backup. Everything is free.
3. **Learns from you.** 👍 *Keep this one* saves the model to the library, so similar requests start from it; 👎 lowers the references it came from.

Setup for the local part: install [Ollama](https://ollama.com), then `ollama pull qwen3.5:9b` and `ollama pull embeddinggemma`. Without Ollama, Kinex uses ASU and keyword search.

## Remodel a real house by chat

Press **Open sample house** (or open your own `.ifc` building file). Kinex reads the real model, with every wall, door, window, floor, roof, stair, piece of furniture and room, plus which floor each is on, which walls are exterior or load-bearing, which wall each door and window sits in, and which walls join. Then talk to it:

- "remove the sofa", "hide the roof", "show only Level 2", "make the exterior walls brick", "undo"
- "how many windows are on the ground floor?", "which walls have doors?", "total length of the exterior walls?"

The AI never invents geometry: it picks existing elements by their facts and Kinex applies exact, undoable operations (highlight, isolate, hide, remove, recolor, material, move, rotate, scale, duplicate). Answers are computed from the model data. Click anything in the model to see what it is; the left panel lists every item by type and floor.

Sample model: the *Duplex Apartment* from the buildingSMART Community Sample Test Files, CC BY 4.0 (see `public/models/ATTRIBUTION.md`).

## The screen

- **Top bar**: gravity and light, *Open 3D file*, *Export*, and two switches on the right: **Hands** turns on the webcam and hand gestures (off by default), **Chat** opens the conversation.
- **Chat (right)**: describe something, then keep talking to the same model: "make the towers taller", "add a drawbridge", "paint the roof blue", "remove the flag", "add detail". Each reply streams the change into the model live and lists what changed.
- **Model (middle)**: never covered. Drag to orbit, scroll to zoom, double-click a model to inspect it.
- **Inspect (left, when open)**: views, exact X / Y / Z turns, explode, wireframe, spin, *Make it HD*.

### HD models and your own files

- **Make it HD** turns the block model into a real textured 3D mesh: ASU's `flux-2` draws a reference picture (or your Summon photo is used) and `trellis-2` builds the mesh. It takes 2 to 4 minutes; a tray shows the picture and progress, the blocks stay until the mesh is ready, and finished meshes are cached in the browser.
- **Open 3D file** (or drop a file on the page) views any `.glb`, `.gltf`, `.obj` or `.stl`.

## How to use it

| You do | Kinex does |
|---|---|
| Type or say what to build | The model composes it from up to 24 primitives, with scene memory ("make it bigger", "put a tree next to the house") |
| **Pinch** an object | Grab it. Move your hand closer to the camera to pull it toward you |
| **Release** while moving | Throw it. Physics takes over |
| **Pinch with both hands** | Stretch to scale, twist to turn |
| **Hold a fist** over an object | Crush it |
| **Hold a peace sign** | Start talking (hands-free mic) |
| **Pinch a button** | Click it. The whole UI is touchless |
| "Summon from camera" / "summon this" | The model looks at the camera frame, recognizes what you're holding, and builds a replica |
| "Turn off gravity", "make it night" | Change the world: Earth, Moon or zero gravity; studio, sunset, dawn or night light |
| "Export" | Downloads your world as `kinex-world.glb` |

### Inspect: see any model from every side

Double-click a model, press `I`, pinch **Inspect the …**, or say "inspect the castle". The world hides, physics pauses, and the model floats in the studio with its own X / Y / Z axes.

| Do | What happens |
|---|---|
| Pinch and drag (one hand) | Tumble the model in any direction |
| Pinch with both hands | Spread to zoom, twist to roll |
| Quick pinch or click on a part | Zoom onto that part and see its shape, material, color and size |
| Axis gizmo (bottom right) | Tap X / Y / Z to look along that axis |
| Panel: Top / Front / Side / 3⁄4 | Snap the camera |
| Panel: Turn X / Y / Z ±15° ±90°, or keys `X` `Y` `Z` (Shift reverses) | Rotate on an exact axis |
| Explode, Spread slider, Wireframe, Spin | See how the model is put together |
| **Add detail**, or say "add detail" | The AI adds 25–60 small parts (trims, frames, bolts, windows) that stream in while you watch, up to 96 parts |
| Say "rotate 90 on x", "top view", "explode", "wireframe on" | Instant, no AI round-trip |
| `Done`, `Esc`, or "done" | Back to the world, unchanged |

The mouse works too: drag objects to throw them, drag empty space to orbit, scroll while holding to push and pull. `/` focuses the input, `M` toggles the mic, and `Delete` removes the hovered object.

## 90-second demo script

1. "A castle with a red flag." Watch it assemble block by block.
2. Pinch the castle, lift it, and throw it across the room.
3. "Put a dragon next to the castle." Scene memory places it.
4. Two-hand pinch the dragon: stretch it huge, twist it around.
5. Pinch **Gravity: Off** in the toolbar. Everything floats.
6. Hold up a mug (or a shoe, a bottle): "Summon this." A 3D copy appears.
7. Make a fist over the mug to crush it. Peace sign: "Make it night."
8. "Inspect the castle." Turn it on every axis, explode it, then "add detail" and watch it get richer.
9. "Export." The world (or, in Inspect, just the model) downloads as a .glb file.

## How it works

- **React + Vite**, **three.js** via React Three Fiber, **Rapier** physics, bloom postprocessing.
- **MediaPipe HandLandmarker** (two hands, GPU) runs in its own loop and writes into a mutable ref, not React state, so tracking never triggers re-renders. Landmarks pass through a **One Euro filter**. Gestures are normalized by palm size and use **hysteresis**, so pinches don't flicker.
- An **OpenAI-compatible LLM** (`deepseek-v4-1-flash` with reasoning off, `qwen38-27b` as backup, on ASU's server) **streams** a JSON plan, and a tolerant partial-JSON parser drops each part into the scene the moment it's written, so you watch objects build themselves. The plan has spawn, modify, remove, clear and environment. Kinex asks for strict JSON-schema output, falls back to JSON mode or plain text if the server doesn't support it, and remembers what worked. Every response is validated and clamped before it touches the scene. The current scene is sent along, so pronouns and "the red one" resolve.
- Objects are compound rigid bodies with colliders generated from their parts. They stay upright until you throw them hard enough to tumble.

```
src/
  ai/        prompt, schema, LLM client, action validator, offline builder
  vision/    hand tracker, One Euro filter, gesture classifier (+ tests)
  scene/     stage, objects, parts, hand rig (grab / throw / stretch / crush)
  ui/        command bar, camera picture-in-picture, subtitles, hand cursors
  voice/     speech recognition
```

`npm test` runs the gesture and JSON-parsing tests.
