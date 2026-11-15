/* Classic worker: MediaPipe's WASM loader uses importScripts. */
let landmarker
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      importScripts(data.bundle)
      const files = await Vision.FilesetResolver.forVisionTasks(data.wasm)
      try {
        landmarker = await Vision.HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: data.model, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 2,
          minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.55, minTrackingConfidence: 0.55,
        })
      } catch {
        landmarker = await Vision.HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: data.model, delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 2,
          minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.55, minTrackingConfidence: 0.55,
        })
      }
      self.postMessage({ type: 'ready' })
    } catch (error) { self.postMessage({ type: 'error', message: String(error.message || error) }) }
    return
  }
  if (data.type === 'frame') {
    try {
      const started = performance.now()
      const result = landmarker.detectForVideo(data.frame, data.timestamp)
      self.postMessage({ type: 'result', landmarks: result.landmarks, inferenceMs: performance.now() - started })
    } catch (error) { self.postMessage({ type: 'frame-error', message: String(error.message || error) }) }
    finally { data.frame.close() }
  }
}
