/* ============================================================
   FLIGHT SOUND
   Made live with Web Audio, nothing downloaded, and only when the sound
   switch is on:
   - the engines: a low rumble and roar that follow the thrust;
   - wind: rushing air, louder and higher with speed, and only where
     there is air (silence in space, as it should be);
   - re-entry: a deep roar with crackle as the plasma builds;
   - warp: a rising whine, and a soft thump as the ship drops out;
   - touchdown: a thud and a hiss.
============================================================ */

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext }

/* the sound switch, shared with the journey's soundtrack */
export const soundSwitch = { on: false }
export const SOUND_EVENT = 'urniverse-sound'

export type FlightSoundState = {
  thrust: number // 0..1
  air: number // 0..1, air density here
  kms: number // speed
  heat: number // re-entry 0..1
  warp: number // warp glow 0..1
}

export class FlightAudio {
  private context: AudioContext
  private master: GainNode
  private engineGain: GainNode
  private engineFilter: BiquadFilterNode
  private hum: OscillatorNode
  private windGain: GainNode
  private windFilter: BiquadFilterNode
  private roarGain: GainNode
  private crackle: GainNode
  private warpGain: GainNode
  private warpTone: OscillatorNode
  private warpOver: OscillatorNode
  private lastWarp = 0
  private stopped = false

  constructor() {
    const Context = window.AudioContext ?? (window as AudioWindow).webkitAudioContext
    this.context = new Context!()
    const ctx = this.context
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)
    const noise = this.noise(3)

    // engines: brown-ish noise through a low-pass, plus a low hum
    this.engineFilter = ctx.createBiquadFilter()
    this.engineFilter.type = 'lowpass'
    this.engineFilter.frequency.value = 160
    this.engineGain = ctx.createGain()
    this.engineGain.gain.value = 0
    const engineNoise = ctx.createBufferSource()
    engineNoise.buffer = noise
    engineNoise.loop = true
    engineNoise.connect(this.engineFilter).connect(this.engineGain).connect(this.master)
    engineNoise.start()
    this.hum = ctx.createOscillator()
    this.hum.type = 'sawtooth'
    this.hum.frequency.value = 38
    const humFilter = ctx.createBiquadFilter()
    humFilter.type = 'lowpass'
    humFilter.frequency.value = 120
    const humGain = ctx.createGain()
    humGain.gain.value = 0.25
    this.hum.connect(humFilter).connect(humGain).connect(this.engineGain)
    this.hum.start()

    // wind: band-passed noise
    this.windFilter = ctx.createBiquadFilter()
    this.windFilter.type = 'bandpass'
    this.windFilter.frequency.value = 400
    this.windFilter.Q.value = 0.7
    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0
    const windNoise = ctx.createBufferSource()
    windNoise.buffer = noise
    windNoise.loop = true
    windNoise.playbackRate.value = 0.83
    windNoise.connect(this.windFilter).connect(this.windGain).connect(this.master)
    windNoise.start()

    // re-entry: a deep roar, and crackle on top
    const roarFilter = ctx.createBiquadFilter()
    roarFilter.type = 'lowpass'
    roarFilter.frequency.value = 420
    this.roarGain = ctx.createGain()
    this.roarGain.gain.value = 0
    const roarNoise = ctx.createBufferSource()
    roarNoise.buffer = noise
    roarNoise.loop = true
    roarNoise.playbackRate.value = 0.61
    roarNoise.connect(roarFilter).connect(this.roarGain).connect(this.master)
    roarNoise.start()
    const crackleFilter = ctx.createBiquadFilter()
    crackleFilter.type = 'highpass'
    crackleFilter.frequency.value = 2400
    this.crackle = ctx.createGain()
    this.crackle.gain.value = 0
    const crackleNoise = ctx.createBufferSource()
    crackleNoise.buffer = noise
    crackleNoise.loop = true
    crackleNoise.playbackRate.value = 1.37
    crackleNoise.connect(crackleFilter).connect(this.crackle).connect(this.master)
    crackleNoise.start()

    // warp: two tones that rise together
    this.warpGain = ctx.createGain()
    this.warpGain.gain.value = 0
    this.warpGain.connect(this.master)
    this.warpTone = ctx.createOscillator()
    this.warpTone.type = 'sine'
    this.warpOver = ctx.createOscillator()
    this.warpOver.type = 'triangle'
    const overGain = ctx.createGain()
    overGain.gain.value = 0.3
    this.warpTone.connect(this.warpGain)
    this.warpOver.connect(overGain).connect(this.warpGain)
    this.warpTone.start()
    this.warpOver.start()
  }

  private noise(seconds: number) {
    const ctx = this.context
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < data.length; i += 1) {
      // a little brown, so it is not hissy
      last = (last + 0.06 * (Math.random() * 2 - 1)) / 1.06
      data[i] = last * 3.2 + (Math.random() * 2 - 1) * 0.25
    }
    return buffer
  }

  async start() {
    await this.context.resume()
    const now = this.context.currentTime
    this.master.gain.setTargetAtTime(0.55, now, 0.6)
  }

  stop() {
    if (this.stopped) return
    this.stopped = true
    const now = this.context.currentTime
    this.master.gain.setTargetAtTime(0, now, 0.25)
    window.setTimeout(() => this.context.close(), 1200)
  }

  update(state: FlightSoundState) {
    if (this.stopped || this.context.state !== 'running') return
    const now = this.context.currentTime
    const ease = 0.12
    this.engineGain.gain.setTargetAtTime(0.05 + state.thrust * 0.32, now, ease)
    this.engineFilter.frequency.setTargetAtTime(120 + state.thrust * 520, now, ease)
    this.hum.frequency.setTargetAtTime(34 + state.thrust * 22, now, ease)
    // wind needs air: none in space
    const rush = state.air * Math.min(1, state.kms / 0.35)
    this.windGain.gain.setTargetAtTime(Math.min(0.5, rush * 0.55), now, 0.2)
    this.windFilter.frequency.setTargetAtTime(250 + Math.min(state.kms, 2) * 900, now, 0.2)
    this.roarGain.gain.setTargetAtTime(state.heat * 0.6, now, 0.15)
    // crackle: bursts that come and go
    this.crackle.gain.setTargetAtTime(state.heat * (0.04 + Math.random() * 0.16), now, 0.03)
    this.warpGain.gain.setTargetAtTime(state.warp * 0.12, now, 0.1)
    this.warpTone.frequency.setTargetAtTime(90 + state.warp * 640, now, 0.15)
    this.warpOver.frequency.setTargetAtTime(135 + state.warp * 980, now, 0.15)
    // dropping out of warp: a soft thump
    if (this.lastWarp > 0.6 && state.warp <= 0.6) this.thump(70, 0.5)
    this.lastWarp = state.warp
  }

  /* touchdown: a thud and a hiss */
  touchdown() {
    this.thump(55, 0.7)
    const ctx = this.context
    const now = ctx.currentTime
    const hiss = ctx.createBufferSource()
    hiss.buffer = this.noise(1.2)
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 1800
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1)
    hiss.connect(filter).connect(gain).connect(this.master)
    hiss.start(now)
    hiss.stop(now + 1.2)
  }

  private thump(frequency: number, level: number) {
    const ctx = this.context
    const now = ctx.currentTime
    const tone = ctx.createOscillator()
    tone.type = 'sine'
    tone.frequency.setValueAtTime(frequency * 1.6, now)
    tone.frequency.exponentialRampToValueAtTime(frequency, now + 0.25)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(level, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9)
    tone.connect(gain).connect(this.master)
    tone.start(now)
    tone.stop(now + 1)
  }
}
