import * as THREE from 'three'
import { RenderPass } from 'postprocessing'

/* ============================================================
   THE SHIP'S OWN LAYER
   The Shuttle is drawn at its true size: 37 m against a 12,742 km Earth,
   a third of a millionth of the planet. No single depth buffer can hold
   both (the camera would need a near limit of centimetres and a far one
   of billions of km), so the ship is drawn in a scene of its own, at a
   scale where it is one unit long, with a camera that copies the real
   one's view of it. Its pass runs right after the main render, inside the
   same post-processing (bloom, smoothing, grain), clearing only depth:
   nothing in the Solar System can come between the camera and a ship a
   few dozen metres ahead of it.
============================================================ */

export const shipScene = new THREE.Scene()
export const shipCamera = new THREE.PerspectiveCamera(52, 1, 0.05, 400)

class ShipPass extends RenderPass {
  render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget,
    outputBuffer: THREE.WebGLRenderTarget,
    deltaTime?: number,
    stencilTest?: boolean,
  ) {
    // draw over the frame: keep its colour, clear only its depth
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    super.render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest)
    renderer.autoClear = autoClear
  }
}

let pass: ShipPass | null = null
export function getShipPass() {
  if (!pass) {
    pass = new ShipPass(shipScene, shipCamera)
    pass.clearPass.setClearFlags(false, true, false)
    pass.enabled = false
  }
  return pass
}
