import * as THREE from 'three'

import { getBodyPosition, getBodyRadius, PLANETS, SUN_TRUE_RADIUS, SYSTEM_OFFSET } from './orbit'
import { simClock } from './simClock'

/* How much of the Sun can be seen from a point (0..1): the planets eclipse
   it, with a soft edge as wide as the Sun's own disc. Near the limb of a
   world with air, the light that is left is reddened (the sunrise and
   sunset seen from orbit). Flying only: true scale. */

const _toPlanet = new THREE.Vector3()
const _toSun = new THREE.Vector3()

export function sunVisibility(from: THREE.Vector3, tint?: THREE.Color) {
  _toSun.copy(SYSTEM_OFFSET).sub(from)
  const sunDistance = _toSun.length()
  _toSun.divideScalar(sunDistance)
  const sunAngle = Math.asin(Math.min(1, SUN_TRUE_RADIUS / Math.max(sunDistance, SUN_TRUE_RADIUS)))
  let visible = 1
  let red = 0
  for (let i = 0; i < PLANETS.length; i += 1) {
    getBodyPosition(i, simClock.jd, _toPlanet).sub(from)
    const distance = _toPlanet.length()
    const along = _toPlanet.dot(_toSun)
    if (along <= 0 || distance > sunDistance) continue
    const radius = getBodyRadius(i)
    if (distance <= radius) continue
    const planetAngle = Math.asin(radius / distance)
    const apart = Math.acos(THREE.MathUtils.clamp(along / distance, -1, 1))
    const seen = THREE.MathUtils.smoothstep(apart, planetAngle - sunAngle, planetAngle + sunAngle)
    if (PLANETS[i].atmosphereColor) red = Math.max(red, Math.sin(Math.PI * seen) * (seen < 1 ? 1 : 0))
    visible = Math.min(visible, seen)
  }
  if (tint) tint.setRGB(1, 1 - 0.42 * red, 1 - 0.68 * red)
  return visible
}
