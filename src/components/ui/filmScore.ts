/* ============================================================
   THE FILM'S SCORE
   An original organ score for the six shots, made live with the Web
   Audio API (no audio files): a pipe-organ tone built from its own
   harmonics, under a long cathedral reverb. One chord per shot, in D
   minor, rising through the film and resolving to D major on the last:

     1  D minor (add 9)      the held chord and a low pedal
     2  B-flat major 7       a clock begins to tick
     3  F major              the organ starts to pulse (eighth notes)
     4  G minor              the pulse grows
     5  C (add 9)            octaves doubled, a high shimmer
     6  D major              everything, then a long fade

   Played only once the visitor starts the film (browsers allow sound
   only after a click); quiet, and switched off from the film's controls.
============================================================ */

const midi = (note: number) => 440 * 2 ** ((note - 69) / 12)

/* per shot: the pedal (bass) and the chord, as MIDI notes */
const CHORDS: { bass: number; notes: number[] }[] = [
  { bass: 38, notes: [50, 53, 57, 64] }, // D minor add 9
  { bass: 34, notes: [53, 57, 58, 62] }, // B-flat major 7
  { bass: 41, notes: [48, 53, 57, 60] }, // F major
  { bass: 43, notes: [50, 55, 58, 62] }, // G minor
  { bass: 36, notes: [48, 52, 55, 62] }, // C add 9
  { bass: 38, notes: [50, 54, 57, 62, 66] }, // D major
]

/* the pulse: which chord tone each eighth note plays (up and back) */
const PATTERN = [0, 1, 2, 3, 2, 1, 2, 3]
const STEP = 0.25 // seconds an eighth note
const TICK = 1 // seconds between the clock's ticks

const LEVEL = 0.32
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext }

export class FilmScore {
  private ctx: AudioContext
  private master: GainNode
  private bus: GainNode
  private reverb: ConvolverNode
  private organ: PeriodicWave
  private shot = 1
  private pads: { stop: (at: number) => void }[] = []
  private scheduler = 0
  private nextStep = 0
  private stepIndex = 0
  private nextTick = 0
  private finishTimer = 0
  private closed = false

  constructor() {
    const Context = window.AudioContext ?? (window as AudioWindow).webkitAudioContext
    this.ctx = new Context!()
    const ctx = this.ctx

    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -14
    limiter.ratio.value = 6
    limiter.connect(ctx.destination)

    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(limiter)

    // a cathedral: a long reverb from decaying noise, darker as it fades
    this.reverb = ctx.createConvolver()
    this.reverb.buffer = this.impulse(7)
    const wet = ctx.createGain()
    wet.gain.value = 0.7
    this.reverb.connect(wet).connect(this.master)

    // everything played goes through the bus: dry and into the reverb
    this.bus = ctx.createGain()
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 3800
    this.bus.connect(tone)
    tone.connect(this.master)
    tone.connect(this.reverb)

    // the pipe organ: principal pipes at the fundamental and octaves,
    // a little of the fifths (a church organ's registration)
    const harmonics = [0, 1, 0.62, 0.3, 0.42, 0.1, 0.22, 0.04, 0.16, 0.03, 0.06]
    this.organ = ctx.createPeriodicWave(new Float32Array(harmonics.length), new Float32Array(harmonics))
  }

  /** begin (after a click), on a shot */
  async start(shot: number) {
    await this.ctx.resume()
    const now = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(0, now)
    this.master.gain.linearRampToValueAtTime(LEVEL, now + 2.5)
    this.nextStep = now + 0.1
    this.nextTick = now + 0.1
    this.setShot(shot)
    this.scheduler = window.setInterval(() => this.schedule(), 50)
  }

  /** the film cut to a shot: its chord, and its layers */
  setShot(shot: number) {
    if (this.closed) return
    window.clearTimeout(this.finishTimer)
    const now = this.ctx.currentTime
    // back up to full if it was fading out at the end
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(this.master.gain.value, now)
    this.master.gain.linearRampToValueAtTime(LEVEL, now + 1.5)
    this.shot = Math.max(1, Math.min(CHORDS.length, shot))
    const chord = CHORDS[this.shot - 1]
    // the held chord crossfades to the new one
    this.pads.forEach((pad) => pad.stop(now + 2.2))
    this.pads = []
    const swell = 0.6 + this.shot * 0.08
    this.pads.push(this.voice(midi(chord.bass), now, 0.16 * swell, 2.4))
    this.pads.push(this.voice(midi(chord.bass - 12), now, 0.1 * swell, 3))
    chord.notes.forEach((note) => this.pads.push(this.voice(midi(note), now, (0.055 * swell) / chord.notes.length * 4, 2.8)))
    // the last shot: a high, quiet octave over everything
    if (this.shot >= 5) chord.notes.slice(1, 4).forEach((note) => this.pads.push(this.voice(midi(note + 24), now, 0.018, 4, true)))
  }

  /** the film ended on its own: let the last chord ring, then fade */
  finish() {
    window.clearTimeout(this.finishTimer)
    this.finishTimer = window.setTimeout(() => {
      const now = this.ctx.currentTime
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setValueAtTime(this.master.gain.value, now)
      this.master.gain.linearRampToValueAtTime(0, now + 7)
    }, 2500)
  }

  /** fade out and close */
  stop() {
    if (this.closed) return
    this.closed = true
    window.clearInterval(this.scheduler)
    window.clearTimeout(this.finishTimer)
    const now = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(this.master.gain.value, now)
    this.master.gain.linearRampToValueAtTime(0, now + 1.6)
    window.setTimeout(() => this.ctx.close().catch(() => {}), 2000)
  }

  /* look a little ahead and place the notes and ticks that fall in it */
  private schedule() {
    const ahead = this.ctx.currentTime + 0.3
    const chord = CHORDS[this.shot - 1]
    while (this.nextStep < ahead) {
      // the pulse, from the third shot; doubled at the octave from the fifth
      if (this.shot >= 3) {
        const index = PATTERN[this.stepIndex % PATTERN.length] % chord.notes.length
        const note = chord.notes[index] + 12
        const accent = this.stepIndex % 4 === 0 ? 1.25 : 1
        const level = (this.shot === 3 ? 0.03 : this.shot === 4 ? 0.045 : 0.055) * accent
        this.pluck(midi(note), this.nextStep, level)
        if (this.shot >= 5) this.pluck(midi(note + 12), this.nextStep, level * 0.45)
      }
      this.nextStep += STEP
      this.stepIndex += 1
    }
    while (this.nextTick < ahead) {
      if (this.shot >= 2) this.tick(this.nextTick, this.shot >= 4 ? 0.07 : 0.045)
      this.nextTick += TICK
    }
  }

  /* a held organ note; `stop` lets it go */
  private voice(frequency: number, at: number, level: number, attack: number, pure = false) {
    const ctx = this.ctx
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(level, at + attack)
    gain.connect(this.bus)
    // two pipes a few cents apart: the slow beating of a real organ
    const oscillators = [-4, 4].map((cents) => {
      const osc = ctx.createOscillator()
      if (pure) osc.type = 'sine'
      else osc.setPeriodicWave(this.organ)
      osc.frequency.value = frequency
      osc.detune.value = cents
      osc.connect(gain)
      osc.start(at)
      return osc
    })
    return {
      stop: (end: number) => {
        const now = ctx.currentTime
        gain.gain.cancelScheduledValues(now)
        gain.gain.setValueAtTime(gain.gain.value, now)
        gain.gain.linearRampToValueAtTime(0, end)
        oscillators.forEach((osc) => osc.stop(end + 0.1))
      },
    }
  }

  /* one short organ note of the pulse */
  private pluck(frequency: number, at: number, level: number) {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.setPeriodicWave(this.organ)
    osc.frequency.value = frequency
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(level, at + 0.015)
    gain.gain.setTargetAtTime(level * 0.55, at + 0.03, 0.08)
    gain.gain.setTargetAtTime(0, at + STEP * 0.85, 0.04)
    osc.connect(gain).connect(this.bus)
    osc.start(at)
    osc.stop(at + STEP + 0.3)
  }

  /* the clock: a dry, wooden tick */
  private tick(at: number, level: number) {
    const ctx = this.ctx
    const length = Math.floor(ctx.sampleRate * 0.03)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 6)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 2400
    band.Q.value = 3
    const gain = ctx.createGain()
    gain.gain.value = level
    source.connect(band).connect(gain).connect(this.master)
    source.start(at)
  }

  private impulse(seconds: number) {
    const ctx = this.ctx
    const length = Math.floor(ctx.sampleRate * seconds)
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel)
      let last = 0
      for (let i = 0; i < length; i += 1) {
        // darker as it fades: the noise smoothed more towards the tail
        const k = i / length
        last += (Math.random() * 2 - 1 - last) * (1 - k * 0.85)
        data[i] = last * Math.pow(1 - k, 2.4)
      }
    }
    return buffer
  }
}

/** the ambient soundtrack steps back while the film's score plays */
export const FILM_SCORE_EVENT = 'urniverse-film-score'
