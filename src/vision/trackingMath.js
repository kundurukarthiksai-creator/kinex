export function validHands(detections) {
  return (Array.isArray(detections) ? detections : []).filter((hand) => Array.isArray(hand) && hand.length === 21 && hand.every((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z))).slice(0, 2)
}

export function matchHands(detections, slots) {
  const distance = (hand, slot, index) => slot.present ? Math.hypot(slot.lm[0].x - hand[0].x, slot.lm[0].y - hand[0].y) : 5 + index * 0.01
  if (detections.length === 2) {
    const direct = distance(detections[0], slots[0], 0) + distance(detections[1], slots[1], 1)
    const crossed = distance(detections[0], slots[1], 1) + distance(detections[1], slots[0], 0)
    return crossed < direct ? [[1, detections[0]], [0, detections[1]]] : [[0, detections[0]], [1, detections[1]]]
  }
  if (detections.length === 1) {
    const index = distance(detections[0], slots[0], 0) <= distance(detections[0], slots[1], 1) ? 0 : 1
    return [[index, detections[0]]]
  }
  return []
}
