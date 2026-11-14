# Kinex

**Speak a world into existence, then sculpt it with your bare hands.**

Kinex runs in the browser with nothing but a webcam. You say what you want ("a castle with a red flag", "a solar system") and Gemini acts as an architect: it composes the object out of primitives and it assembles in front of you, piece by piece. Then you reach out and pinch it, throw it, stretch it with two hands, or crush it with your fist. Hold a real object up to the camera, say "summon this", and Kinex builds a 3D copy of it.

No headset. No mouse. No install.

## Run it

```bash
npm install          # also copies the hand-tracking model into /public for offline use
cp .env.example .env # then paste your key: GEMINI_API=...
npm run dev
```

Open http://localhost:5173 in **Chrome or Edge** (voice uses the Web Speech API). Allow the camera and microphone.

Get a Gemini key at https://aistudio.google.com/apikey. Without a key, Kinex falls back to an offline builder that knows a few shapes, so the demo never dies on bad Wi-Fi.

## How to use it

| You do | Kinex does |
|---|---|
| Type or say what to build | Gemini composes it from up to 24 primitives, with scene memory ("make it bigger", "put a tree next to the house") |
| **Pinch** an object | Grab it. Move your hand closer to the camera to pull it toward you |
| **Release** while moving | Throw it. Physics takes over |
| **Pinch with both hands** | Stretch to scale, twist to turn |
| **Hold a fist** over an object | Crush it |
| **Hold a peace sign** | Start talking (hands-free mic) |
| **Pinch a button** | Click it. The whole UI is touchless |
| "Summon from camera" / "summon this" | Gemini Vision recognizes what you're holding and builds a replica |
| "Turn off gravity", "make it night" | Change the world: Earth, Moon or zero gravity; studio, sunset, dawn or night light |
| "Export" | Downloads your world as `kinex-world.glb` |

The mouse works too: drag objects to throw them, drag empty space to orbit, scroll while holding to push and pull. `/` focuses the input, `M` toggles the mic, and `Delete` removes the hovered object.

## 90-second demo script

1. "A castle with a red flag." Watch it assemble block by block.
2. Pinch the castle, lift it, and throw it across the room.
3. "Put a dragon next to the castle." Scene memory places it.
4. Two-hand pinch the dragon: stretch it huge, twist it around.
5. Pinch **Gravity: Off** in the toolbar. Everything floats.
6. Hold up a mug (or a shoe, a bottle): "Summon this." A 3D copy appears.
7. Make a fist over the mug to crush it. Peace sign: "Make it night."
8. "Export." The world downloads as a .glb file.

## How it works

- **React + Vite**, **three.js** via React Three Fiber, **Rapier** physics, bloom postprocessing.
- **MediaPipe HandLandmarker** (two hands, GPU) runs in its own loop and writes into a mutable ref, not React state, so tracking never triggers re-renders. Landmarks pass through a **One Euro filter**. Gestures are normalized by palm size and use **hysteresis**, so pinches don't flicker.
- **Gemini** returns structured JSON (`responseJsonSchema`): spawn, modify, delete, clear and environment actions. Every response is validated and clamped before it touches the scene. The current scene is sent along, so pronouns and "the red one" resolve.
- Objects are compound rigid bodies with colliders generated from their parts. They stay upright until you throw them hard enough to tumble.

```
src/
  ai/        prompt, schema, Gemini client, action validator, offline builder
  vision/    hand tracker, One Euro filter, gesture classifier (+ tests)
  scene/     stage, objects, parts, hand rig (grab / throw / stretch / crush)
  ui/        command bar, camera picture-in-picture, subtitles, hand cursors
  voice/     speech recognition
```

`npm test` runs the gesture classifier tests.
