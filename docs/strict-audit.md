# Kinex — strict hackathon audit

Audit date: November 14, 2026, America/Phoenix.

## Verdict

**Credible hackathon prototype; live demo readiness is conditional.** The implementation supports a coherent educational 3D exploration demo, and the automated checks below pass after fixes. It is not yet appropriate to call the whole experience verified: the presenter confirmed that real pinch interaction and real voice commands have not both been tested on the presentation laptop.

Present it as **“a browser workspace for exploring 3D educational models with words and hands.”** The strongest demonstration is a detailed local ship, one genuine custom AI build, hand manipulation, an individual color edit, inspection and undo. Do not describe it as arbitrary photorealistic text-to-3D, accurate photo reconstruction, CAD, ray reconstruction, NeRF or Gaussian splatting.

There is no evidence here that it will beat other teams, improve learning outcomes, or handle production traffic. Those claims require different evidence.

## Checks completed

| Area | Result | Evidence and limits |
| --- | --- | --- |
| Automated regression tests | Pass | **83 tests** cover parsing, bounded actions, target selection, geometry, history, material edits, persistence, voice lifecycle and startup ordering. Tests do not prove the absence of bugs. |
| Clean dependency install | Pass | `npm ci` succeeded in a separate checkout without copying the project’s environment file. The final source was also tested against that fresh installation. |
| Production build | Pass | The built application was exercised through Vite preview, including its actual provider proxy, rather than checking only development mode. |
| Dependency advisory scan | Pass within scope | `npm audit` reported **0 known vulnerabilities** at audit time. This is not a penetration test or a guarantee against undisclosed vulnerabilities. |
| Credential handling | Pass within scope | No configured API key matched tracked/untracked source, production output, or reviewed Git-history blobs. `.env` remains ignored; the provider key is added by the server proxy. |
| Model integrity/provenance | Pass | All four bundled GLB checksums match the manifest. The original ship and credited Microsoft CC0 assets are distinguished from custom AI shapes. |
| Production mesh/material export | Pass | A ship contains real mesh geometry. Exported GLB material values match independently requested hull/window colors. |
| Import and persistence | Pass | Valid GLB export/re-import and saved appearance survive reload after the Saved indicator. Empty geometry fails without removing the existing scene. |
| Simplified interface | Pass for tested flows | Default canvas has no permanent tab/sidebar clutter. Models/Edit/More drawers, focus restoration, history, settings, demo/help and export work. Tested in Chrome at desktop, 390px and 320px widths using viewport emulation, not physical mobile devices. This is not a full accessibility certification. |
| Controlled hand interaction | Pass | Deterministic hand input turns the selection, preserves release orientation, and joins two hands for scaling/twisting. The fixture stops the starter’s automatic motion so that movement does not contaminate the rotation measurement. |
| Webcam lifecycle/failure cases | Pass with automated input | Opt-in, collapse/reopen, stop, denied permission, blocked worker startup, silent worker recovery and camera disconnection were exercised. Automated video does not measure human tracking accuracy. |
| Real custom AI request | Pass | The production proxy completed a genuine Gemini robot request. One audited request took about **11.7 seconds**; another took about 8.6 seconds. These are individual observations, not an SLA or average. |
| Real photo interpretation | Pass for the integration | An artificial red-mug reference was sent through the actual photo API; a three-part approximation was created and opened while another model had been inspected. Project saves excluded the reference image. This does not establish real-photograph reconstruction quality. |
| Malformed/interrupted AI | Pass | Wrong list types, null entries, interrupted JSON streams, idle timeout, unavailable server and cancellation preserve a usable world. Completed streamed parts finalize and undo together. |
| Local/no-key operation | Pass | A clean build without the project `.env`, with external network requests blocked, could load the ship, recolor, use a local robot recipe and run local worker tracking. No provider request was made. A local application server was still running. |
| Browser-storage denial | Pass | A visible “Session only · Export to keep your work” message appears; editing and GLB export remain usable. |
| Runtime errors | No uncaught errors in completed suites | The completed production, failure-recovery and simplified-UI suites recorded no uncaught browser page errors. Expected provider/device failures were tested separately. |

## Bugs found and fixed during this audit

These were genuine gaps beyond the previous happy-path checks.

| Priority | Finding | Fix |
| --- | --- | --- |
| High | Bare “delete” could clear the whole world. | Bare delete now removes the selected model; clearing all requires an explicit world/scene/all command. |
| High | An explicit missing target could silently fall back to another selected model. Multiword names could select the wrong object. | Explicit unresolved names no longer fall back. Local commands retain full object names and report missing targets. |
| High | Malformed AI arrays/null entries could throw; a string such as `clear: "false"` was truthy. | Root-object checks, bounded list handling and literal-boolean clearing prevent those effects. Malformed creations are excluded from the reuse cache, so repeating one cannot crash the cache path. |
| High | The final action budget could omit some streamed creations and leave unfinished objects. | Bounded final action handling covers the allowed lists; leftover completed streamed geometry is finalized. |
| High | A world could exceed the 100-object limit accepted by saved-world restoration. | Creation now enforces the same 100-model limit. A regression case verifies that a capped world can be serialized and restored. |
| Medium | Glow/glass edits affected the invisible primitive proxy rather than the detailed mesh. | Standard glTF material properties now receive those edits; export retains them. Wood is an approximate surface finish, not generated wood grain. |
| Medium | Empty/invalid or overly large imports could produce an invisible model, overrun a practical geometry budget or wait indefinitely. | Imports are cancelable and limited to 30 MB, 750,000 vertices, 500,000 triangles and 8192px textures. Invalid coordinates/empty bounds are rejected, and loading has a 15-second deadline. |
| Medium | A microphone session ending without final text could leave “Listening” feedback stuck. | End/cancel handling reads current state and clears listening feedback; microphone construction failure is handled. |
| Medium | A blocked Worker constructor bypassed the fallback; a silent worker could leave inference busy, and stale input could remain active. | Constructor failures use compatibility inference, a three-second worker watchdog recovers stalled frames, and stale hand input expires. |
| Medium | Photo creation while inspecting another object could create a result outside the visible view. | Reconstruction leaves the old inspection and opens the newly created model. |
| Medium | A very early Inspect click could be lost, and Export could be enabled before the 3D scene was mounted. | Inspection requests queue until camera controls exist; loading/export reflect actual 3D readiness. Disposed scene references are cleared. |
| Medium | Browser-storage failure was difficult to notice in the compact/mobile layout. | The command area now shows a persistent session-only/export message. |

## Remaining limits and readiness gaps

1. **Real hands and real voice are unverified.** This is the main live-demo risk. Webcam lighting, occlusion, hand placement, microphone quality and browser speech services matter. Neither synthetic landmarks nor mocked recognition events can sign this off.
2. **Detailed generation is limited.** The ship is an original deterministic mesh. The other detailed library subjects are existing credited assets. Novel descriptions use bounded primitive geometry unless a separately configured mesh provider is available. That optional provider is not configured for this demo and was not certified here.
3. **Educational usefulness is a hypothesis.** The marine-design example and buoyancy question give the demo a purpose, but there is no classroom study or evidence of improved learning. The scene does not simulate water, buoyancy or engineering loads.
4. **AI latency varies.** Text generation has an 18-second total budget; photos/refinement have a 35-second budget. Do not promise every object in two seconds. Keep the local ship and common edits ready.
5. **Performance has practical limits.** The main production bundle is roughly 3.86 MB raw / 1.30 MB gzip; the hand model is about 7.8 MB, and the four local meshes total about 32 MB. Mesh assets load when chosen. A slow first load or weak GPU remains possible. The 100-object cap protects restoration; it is not a guarantee that a 100-model scene will animate smoothly. Use a small demo and test Balanced quality if needed. A long memory-soak test and a broader physical browser/device matrix were not completed.
6. **This is a local/preview deployment.** No public production URL, authentication/rate-limited backend or production load test was established. A plain static upload does not supply the credential proxy. A local demo can still be valid; do not advertise public deployment as completed.
7. **The GitHub landing page now contains the updated project.** The audited implementation has been pushed to `main` in `shivareddy8693/kinex`, so the normal repository URL shows the completed version. The original owner’s repository was not changed.
8. **Submission administration is not verified.** The Devpost entry, video and event-specific reuse/disclosure rules were not accessible/inspected here. Retain credit and accurately explain the original prototype, your fork’s changes, supplied assets and AI-assisted development.

The official [Sunhacks schedule](https://sunhacks.io/) lists submissions at **11:00 AM Arizona time on November 15**. The linked [2026 Devpost](https://sunhacks-2026.devpost.com/) could not be read by the audit tool, so this report does not certify submission eligibility or prize criteria.

## Required live laptop check before presenting

Use the exact laptop, Chrome/Edge browser and camera/microphone you will present with.

1. Open Kinex and create a realistic ship. Wait until it is visible; leave the ship ready for the demo.
2. Enable hands. In Inspect, pinch thumb to index, turn the ship and release. Repeat five times; confirm movement is deliberate and the model stays after release. Return to World for two-hand scaling/twisting if that is in your presentation.
3. Tap the microphone and say **“Make the hull blue.”** Check both the transcript and the actual hull. Repeat with **“Make the windows yellow.”** Try this in the venue’s ambient noise. Record failures; do not count a correct transcript with a wrong target as a pass.
4. Run the entire 90-second demonstration twice. Have the same commands ready to type, and keep mouse rotation available. A failed voice/gesture attempt should not consume the presentation.
5. Export a GLB and check that the project shows Saved before closing/reloading. If storage is unavailable, use the visible export fallback.

**Sign-off rule:** call the live demo ready only after the real interaction checks and two timed runs succeed. The software audit is complete; those physical presentation checks are still pending.
