// Hand cursors cover the browser, while the scene occupies only its own viewport.
export function viewportPoint(clientX, clientY, rect) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  const x = (clientX - rect.left) / rect.width
  const y = (clientY - rect.top) / rect.height
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null
}
