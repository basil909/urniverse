/* A generative ambient score, made live with the Web Audio API (no audio
   files). Per chapter a soft chord: four detuned voices that glide to the
   next chord as you travel, a slow "breathing" filter, a faint wash of
   filtered noise like wind, and now and then a distant bell note from the
   chord, all through a long reverb. Under it a deep drone that follows
   the journey: lower and fuller the further out you go (deepest diving
   to the galaxy's centre), its tone opening and a rush of air rising
   with the camera's speed. And small sounds to the hand: a soft whoosh
   over a world, a glassy tick over a point of interest, a tiny click on
   a press. Quiet by design; off until the visitor turns it on. */

/* chord voicings per section (intro, Sun, 8 planets, Pale Blue Dot,
   Milky Way, Local Group, return), in Hz */
const CHORDS: number[][] = [
  [73.42, 110.0, 174.61, 329.63], // intro: D minor, open
  [65.41, 98.0, 164.81, 293.66], // Sun: warm C
  [73.42, 110.0, 185.0, 277.18], // Mercury
  [58.27, 87.31, 146.83, 220.0], // Venus: heavy B-flat
  [98.0, 146.83, 246.94, 369.99], // Earth: G major 7, hopeful
  [82.41, 123.47, 196.0, 293.66], // Mars: E minor 7
  [65.41, 98.0, 155.56, 233.08], // Jupiter: C minor 7, grand
  [87.31, 130.81, 220.0, 329.63], // Saturn: F major 7
  [110.0, 164.81, 246.94, 369.99], // Uranus: A, suspended
  [92.5, 138.59, 220.0, 329.63], // Neptune: cool F-sharp
  [73.42, 110.0, 164.81, 369.99], // Pale Blue Dot: D, add 9
  [55.0, 82.41, 123.47, 277.18], // Milky Way: wide and low
  [49.0, 73.42, 110.0, 246.94], // Local Group: lower still, open
  [73.42, 110.0, 174.61, 329.63], // return
]

const MASTER_LEVEL = 0.16

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext }

export class Soundscape {
  private context: AudioContext
  private master: GainNode
  private voices: { osc: OscillatorNode; detuned: OscillatorNode }[] = []
  private filter: BiquadFilterNode
  private reverb: ConvolverNode
  private bellTimer = 0
  private section = 0
  private stopped = false
  /* the journey's drone, and the rush of moving */
  private deep: OscillatorNode
  private deepUpper: OscillatorNode
  private deepLevel: GainNode
  private deepTone: BiquadFilterNode
  private rushLevel: GainNode
  private rushBand: BiquadFilterNode
  private lastTouch = 0

  constructor() {
    const Context = window.AudioContext ?? (window as AudioWindow).webkitAudioContext
    this.context = new Context!()
    const ctx = this.context

    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)

    // a long, soft reverb from decaying noise (no impulse file needed)
    this.reverb = ctx.createConvolver()
    this.reverb.buffer = this.impulse(5.5)
    const wet = ctx.createGain()
    wet.gain.value = 0.75
    this.reverb.connect(wet).connect(this.master)

    // the drone: warm, slowly breathing low-pass
    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = 900
    this.filter.Q.value = 0.6
    const droneGain = ctx.createGain()
    droneGain.gain.value = 0.22
    this.filter.connect(droneGain)
    droneGain.connect(this.master)
    droneGain.connect(this.reverb)

    const breath = ctx.createOscillator()
    breath.frequency.value = 0.045
    const breathDepth = ctx.createGain()
    breathDepth.gain.value = 420
    breath.connect(breathDepth).connect(this.filter.frequency)
    breath.start()

    CHORDS[0].forEach((frequency, i) => {
      const osc = ctx.createOscillator()
      const detuned = ctx.createOscillator()
      osc.type = i === 0 ? 'sine' : 'triangle'
      detuned.type = 'sine'
      osc.frequency.value = frequency
      detuned.frequency.value = frequency
      detuned.detune.value = 7 + i * 3
      const level = ctx.createGain()
      level.gain.value = [0.5, 0.32, 0.2, 0.12][i]
      // each voice swells on its own slow cycle
      const swell = ctx.createOscillator()
      swell.frequency.value = 0.03 + i * 0.017
      const swellDepth = ctx.createGain()
      swellDepth.gain.value = level.gain.value * 0.45
      swell.connect(swellDepth).connect(level.gain)
      swell.start()
      osc.connect(level)
      detuned.connect(level)
      level.connect(this.filter)
      osc.start()
      detuned.start()
      this.voices.push({ osc, detuned })
    })

    // space wind: band-passed noise drifting in pitch
    const noise = ctx.createBufferSource()
    noise.buffer = this.noiseBuffer(4)
    noise.loop = true
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 500
    band.Q.value = 0.8
    const sweep = ctx.createOscillator()
    sweep.frequency.value = 0.021
    const sweepDepth = ctx.createGain()
    sweepDepth.gain.value = 320
    sweep.connect(sweepDepth).connect(band.frequency)
    sweep.start()
    const wind = ctx.createGain()
    wind.gain.value = 0.035
    noise.connect(band).connect(wind)
    wind.connect(this.master)
    wind.connect(this.reverb)
    noise.start()

    // the journey's drone: a sub-bass sine and a sawtooth an octave up,
    // through a low-pass that opens with speed
    this.deep = ctx.createOscillator()
    this.deep.type = 'sine'
    this.deep.frequency.value = 55
    this.deepUpper = ctx.createOscillator()
    this.deepUpper.type = 'sawtooth'
    this.deepUpper.frequency.value = 110
    this.deepUpper.detune.value = -6
    this.deepTone = ctx.createBiquadFilter()
    this.deepTone.type = 'lowpass'
    this.deepTone.frequency.value = 180
    this.deepTone.Q.value = 0.9
    const upperLevel = ctx.createGain()
    upperLevel.gain.value = 0.35
    this.deepLevel = ctx.createGain()
    this.deepLevel.gain.value = 0.05
    this.deep.connect(this.deepTone)
    this.deepUpper.connect(upperLevel).connect(this.deepTone)
    this.deepTone.connect(this.deepLevel)
    this.deepLevel.connect(this.master)
    this.deepLevel.connect(this.reverb)
    this.deep.start()
    this.deepUpper.start()

    // the rush of moving: noise through a band that climbs with speed
    const rush = ctx.createBufferSource()
    rush.buffer = this.noiseBuffer(3)
    rush.loop = true
    this.rushBand = ctx.createBiquadFilter()
    this.rushBand.type = 'bandpass'
    this.rushBand.frequency.value = 300
    this.rushBand.Q.value = 0.7
    this.rushLevel = ctx.createGain()
    this.rushLevel.gain.value = 0
    rush.connect(this.rushBand).connect(this.rushLevel)
    this.rushLevel.connect(this.master)
    this.rushLevel.connect(this.reverb)
    rush.start()

    this.scheduleBell()
  }

  /** the journey's depth (chapters, 0..~14) and the camera's speed (0..1) */
  setMotion(depth: number, speed: number) {
    if (this.stopped || this.context.state !== 'running') return
    const now = this.context.currentTime
    const deep = Math.min(Math.max(depth / 14, 0), 1)
    const fast = Math.min(Math.max(speed, 0), 1)
    // from 55 Hz at the start to an octave below at the far end
    const pitch = 55 * Math.pow(2, -deep)
    this.deep.frequency.setTargetAtTime(pitch, now, 0.6)
    this.deepUpper.frequency.setTargetAtTime(pitch * 2, now, 0.6)
    this.deepLevel.gain.setTargetAtTime(0.05 + 0.11 * deep + 0.05 * fast, now, 0.5)
    this.deepTone.frequency.setTargetAtTime(150 + 90 * (1 - deep) + 520 * fast, now, 0.25)
    this.rushLevel.gain.setTargetAtTime(0.11 * Math.pow(fast, 1.4), now, 0.2)
    this.rushBand.frequency.setTargetAtTime(280 + 1400 * fast, now, 0.25)
  }

  /** a sound to the hand: over a world, over a point, or a press */
  touch(kind: 'world' | 'point' | 'press', pitch = 0) {
    const ctx = this.context
    if (this.stopped || ctx.state !== 'running') return
    const now = ctx.currentTime
    // (never a clatter: one at a time)
    if (now - this.lastTouch < (kind === 'press' ? 0.04 : 0.09)) return
    this.lastTouch = now
    const out = ctx.createGain()
    out.connect(this.master)
    out.connect(this.reverb)
    if (kind === 'world') {
      // a soft whoosh, rising, and a low note of the chord under it
      const air = ctx.createBufferSource()
      air.buffer = this.noiseBuffer(0.6)
      const band = ctx.createBiquadFilter()
      band.type = 'bandpass'
      band.Q.value = 1.4
      band.frequency.setValueAtTime(380, now)
      band.frequency.exponentialRampToValueAtTime(1500, now + 0.4)
      const level = ctx.createGain()
      level.gain.setValueAtTime(0, now)
      level.gain.linearRampToValueAtTime(0.22, now + 0.12)
      level.gain.exponentialRampToValueAtTime(0.001, now + 0.55)
      air.connect(band).connect(level).connect(out)
      air.start(now)
      air.stop(now + 0.6)
      const note = ctx.createOscillator()
      note.type = 'sine'
      note.frequency.value = CHORDS[this.section][1] * 2 * Math.pow(2, pitch / 12)
      const noteLevel = ctx.createGain()
      noteLevel.gain.setValueAtTime(0, now)
      noteLevel.gain.linearRampToValueAtTime(0.035, now + 0.05)
      noteLevel.gain.exponentialRampToValueAtTime(0.0005, now + 1.4)
      note.connect(noteLevel).connect(out)
      note.start(now)
      note.stop(now + 1.5)
    } else {
      // glass: a short, high, damped tone (a press shorter and higher)
      const tone = ctx.createOscillator()
      tone.type = 'sine'
      tone.frequency.value = (kind === 'press' ? 2900 : 1900) * Math.pow(2, pitch / 12)
      const level = ctx.createGain()
      const length = kind === 'press' ? 0.05 : 0.16
      level.gain.setValueAtTime(0, now)
      level.gain.linearRampToValueAtTime(kind === 'press' ? 0.025 : 0.03, now + 0.004)
      level.gain.exponentialRampToValueAtTime(0.0004, now + length)
      tone.connect(level).connect(out)
      tone.start(now)
      tone.stop(now + length + 0.02)
    }
    window.setTimeout(() => out.disconnect(), 2000)
  }

  /** fade in (must follow a user gesture: browsers block sound before one) */
  async start() {
    // (stopped before it could resume: its resume rejects; nothing to do)
    await this.context.resume().catch(() => {})
    if (this.stopped || this.context.state === 'closed') return
    const now = this.context.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(this.master.gain.value, now)
    this.master.gain.linearRampToValueAtTime(MASTER_LEVEL, now + 3)
  }

  /** fade out, then close */
  stop() {
    // (once: a second close of a closed context rejects)
    if (this.stopped) return
    this.stopped = true
    window.clearTimeout(this.bellTimer)
    const now = this.context.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(this.master.gain.value, now)
    this.master.gain.linearRampToValueAtTime(0, now + 1.2)
    window.setTimeout(() => this.context.close().catch(() => {}), 1500)
  }

  /** step back (almost silent) while another score plays, or return */
  duck(on: boolean) {
    if (this.stopped) return
    const now = this.context.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(this.master.gain.value, now)
    this.master.gain.linearRampToValueAtTime(on ? MASTER_LEVEL * 0.08 : MASTER_LEVEL, now + (on ? 1.2 : 3))
  }

  /** glide to the chord of a section */
  setSection(section: number) {
    this.section = Math.max(0, Math.min(CHORDS.length - 1, section))
    const chord = CHORDS[this.section]
    const now = this.context.currentTime
    this.voices.forEach(({ osc, detuned }, i) => {
      osc.frequency.setTargetAtTime(chord[i], now, 1.6)
      detuned.frequency.setTargetAtTime(chord[i], now, 1.6)
    })
  }

  private scheduleBell() {
    if (this.stopped) return
    this.bellTimer = window.setTimeout(() => {
      this.bell()
      this.scheduleBell()
    }, 4500 + Math.random() * 7000)
  }

  /* a soft, distant bell: a chord tone two or three octaves up */
  private bell() {
    const ctx = this.context
    if (ctx.state !== 'running') return
    const chord = CHORDS[this.section]
    const base = chord[1 + Math.floor(Math.random() * 3)]
    const frequency = base * (Math.random() < 0.5 ? 4 : 2)
    const now = ctx.currentTime
    const tone = ctx.createOscillator()
    const overtone = ctx.createOscillator()
    tone.type = 'sine'
    overtone.type = 'sine'
    tone.frequency.value = frequency
    overtone.frequency.value = frequency * 2.76
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.05, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 6)
    const overGain = ctx.createGain()
    overGain.gain.value = 0.25
    tone.connect(gain)
    overtone.connect(overGain).connect(gain)
    gain.connect(this.reverb)
    gain.connect(this.master)
    tone.start(now)
    overtone.start(now)
    tone.stop(now + 6.2)
    overtone.stop(now + 6.2)
  }

  private impulse(seconds: number) {
    const ctx = this.context
    const length = Math.floor(ctx.sampleRate * seconds)
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel)
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3)
      }
    }
    return buffer
  }

  private noiseBuffer(seconds: number) {
    const ctx = this.context
    const length = Math.floor(ctx.sampleRate * seconds)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    // brownish noise: softer than white
    let last = 0
    for (let i = 0; i < length; i += 1) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
      data[i] = last * 3.5
    }
    return buffer
  }
}
