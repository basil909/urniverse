import * as THREE from 'three'

/* The Moon as the journey draws it beside Earth (written each frame by
   Earth's moon system, SolarSystem.tsx), so a label at Earth can step
   aside when the Moon passes in front of it. */
export const earthMoon = {
  centre: new THREE.Vector3(),
  radius: 0,
}

const _toMoon = new THREE.Vector3()
const _toPoint = new THREE.Vector3()

/** a point is behind the drawn Moon, seen from `eye` */
export function hiddenByMoon(eye: THREE.Vector3, point: THREE.Vector3) {
  if (earthMoon.radius <= 0) return false
  _toMoon.copy(earthMoon.centre).sub(eye)
  _toPoint.copy(point).sub(eye)
  const pointDistance = _toPoint.length()
  const moonDistance = _toMoon.length()
  if (moonDistance >= pointDistance || moonDistance <= earthMoon.radius) return false
  // (the Moon's angular radius, a little generous, against the angle between)
  const angle = _toMoon.angleTo(_toPoint)
  return angle < Math.asin(Math.min(1, (earthMoon.radius * 1.06) / moonDistance))
}
