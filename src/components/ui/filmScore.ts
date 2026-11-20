/* ============================================================
   THE FILM'S SCORE
   An original score for the six shots in the manner of a sacred-
   sounding space epic: a choir of men's voices singing a slow,
   plainchant-like line (in D Dorian), low strings beneath, then war
   drums and a driving string figure, building to a full chord. Made
   live with the Web Audio API (no audio files, no recordings): the
   voices are sawtooth waves shaped by the formants of a sung "ah",
   gently detuned and with a slow vibrato, under a long cathedral
   reverb. The melody is this project's own.

   One phrase per shot (eight seconds; repeated while a shot holds):
     1  D minor     the choir alone, low, over a held string drone
     2  B-flat      the strings open into a chord
     3  F           a deep drum every other bar
     4  G minor     the strings begin to drive, in eighth notes
     5  C           the choir in octaves, the drums on every beat
     6  D major     a great drum, the whole choir on one chord, then rest

   Played only once the visitor starts the film (browsers allow sound
   only after a click); quiet, and switched off from the film's controls.
============================================================ */

const midi = (note: number) => 440 * 2 ** ((note - 69) / 12)

const BEAT = 1 // seconds: a slow, chant-like pulse
const PHRASE = 8 // beats in a shot's phrase

type Note = [pitch: number, beats: number]
/* the chant, one phrase per shot (MIDI, beats), sung an octave below */
const PHRASES: Note[][] = [
  [[62, 2], [64, 1], [65, 1], [64, 2], [62, 2]],
  [[62, 1], [65, 1], [67, 2], [65, 1], [62, 1], [60, 2]],
  [[60, 1], [62, 1], [65, 2], [69, 2], [67, 2]],
  [[67, 2], [65, 1], [67, 1], [69, 2], [70, 2]],
  [[72, 2], [70, 1], [69, 1], [67, 2], [64, 2]],
  [[66, 2], [64, 1], [62, 1], [62, 4]],
]
/* per shot: the strings' bass and chord (MIDI) */
const CHORDS: { bass: number; notes: number[] }[] = [
  { bass: 38, notes: [50, 57] },
  { bass: 34, notes: [50, 53, 58] },
  { bass: 41, notes: [48, 53, 57] },
  { bass: 43, notes: [50, 55, 58] },
  { bass: 36, notes: [48, 52, 55] },
  { bass: 38, notes: [50, 54, 57, 62] },
]
/* the formants of a man's sung "ah": centre (Hz), sharpness, level */
const FORMANTS: [number, number, number][] = [
  [700, 5, 1],
  [1150, 7, 0.55],
  [2500, 9, 0.22],
  [3300, 10, 0.1],
]

const LEVEL = 0.34
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext }
type Voice = { stop: (at: number) => void }

export class FilmScore {
  private ctx: AudioContext
  private master: GainNode
  private reverb: ConvolverNode
  private choir: GainNode
  private strings: GainNode
  private drums: GainNode
  private shot = 1
  private sounding: Voice[] = []
  private repeat = 0
  private finishTimer = 0
  private closed = false

  constructor() {
    const Context = window.AudioContext ?? (window as AudioWindow).webkitAudioContext
    this.ctx = new Context!()
    const ctx = this.ctx

    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -12
    limiter.ratio.value = 5
    limiter.connect(ctx.destination)
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(limiter)

    // a cathedral: a long reverb from decaying noise, darker as it fades
    this.reverb = ctx.createConvolver()
    this.reverb.buffer = this.impulse(6.5)
    const wet = ctx.createGain()
    wet.gain.value = 0.85
    this.reverb.connect(wet).connect(this.master)

    // the choir: every voice into one bank of vowel formants
    this.choir = ctx.createGain()
    this.choir.gain.value = 1.6
    const vowel = ctx.createGain()
    FORMANTS.forEach(([frequency, q, level]) => {
      const band = ctx.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.value = frequency
      band.Q.value = q
      const gain = ctx.createGain()
      gain.gain.value = level * 2.4
      this.choir.connect(band).connect(gain).connect(vowel)
    })
    const air = ctx.createBiquadFilter()
    air.type = 'lowpass'
    air.frequency.value = 3600
    vowel.connect(air)
    air.connect(this.master)
    const choirWet = ctx.createGain()
    choirWet.gain.value = 1.3
    air.connect(choirWet).connect(this.reverb)

    // the strings: warm, low-passed
    this.strings = ctx.createGain()
    this.strings.gain.value = 0.5
    const warm = ctx.createBiquadFilter()
    warm.type = 'lowpass'
    warm.frequency.value = 1100
    warm.Q.value = 0.4
    this.strings.connect(warm)
    warm.connect(this.master)
    warm.connect(this.reverb)

    // the drums: dry and wet
    this.drums = ctx.createGain()
    this.drums.gain.value = 0.9
    this.drums.connect(this.master)
    const drumWet = ctx.createGain()
    drumWet.gain.value = 0.5
    this.drums.connect(drumWet).connect(this.reverb)
  }

  /** begin (after a click), on a shot */
  async start(shot: number) {
    await this.ctx.resume()
    const now = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(0, now)
    this.master.gain.linearRampToValueAtTime(LEVEL, now + 2)
    this.setShot(shot)
  }

  /** the film cut to a shot: its phrase, and its layers */
  setShot(shot: number) {
    if (this.closed) return
    window.clearTimeout(this.finishTimer)
    window.clearInterval(this.repeat)
    const now = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(this.master.gain.value, now)
    this.master.gain.linearRampToValueAtTime(LEVEL, now + 1.2)
    this.shot = Math.max(1, Math.min(PHRASES.length, shot))
    // what was sounding lets go
    this.sounding.forEach((voice) => voice.stop(now + 1.2))
    this.sounding = []
    this.play(now + 0.05)
    // a shot held (paused): its phrase again
    this.repeat = window.setInterval(() => {
      this.sounding = this.sounding.slice(-24)
      this.play(this.ctx.currentTime + 0.05, true)
    }, PHRASE * BEAT * 1000)
  }

  /** the film ended on its own: let the last chord ring, then fade */
  finish() {
    window.clearInterval(this.repeat)
    window.clearTimeout(this.finishTimer)
    this.finishTimer = window.setTimeout(() => {
      const now = this.ctx.currentTime
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setValueAtTime(this.master.gain.value, now)
      this.master.gain.linearRampToValueAtTime(0, now + 7)
    }, 3000)
  }

  /** fade out and close */
  stop() {
    if (this.closed) return
    this.closed = true
    window.clearInterval(this.repeat)
    window.clearTimeout(this.finishTimer)
    const now = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(this.master.gain.value, now)
    this.master.gain.linearRampToValueAtTime(0, now + 1.6)
    window.setTimeout(() => this.ctx.close().catch(() => {}), 2000)
  }

  /* one shot's eight beats, from `at` */
  private play(at: number, again = false) {
    const shot = this.shot
    const chord = CHORDS[shot - 1]
    const phrase = PHRASES[shot - 1]
    const length = PHRASE * BEAT

    // the strings: a drone, then a chord (held across the phrase)
    const swell = 0.7 + shot * 0.07
    this.sounding.push(this.bowed(midi(chord.bass), at, length + 0.6, 0.13 * swell, again ? 0.6 : 2.5))
    this.sounding.push(this.bowed(midi(chord.bass - 12), at, length + 0.6, 0.09 * swell, again ? 0.6 : 3))
    if (shot >= 2) chord.notes.forEach((note) => this.sounding.push(this.bowed(midi(note), at, length + 0.6, 0.035 * swell, again ? 0.6 : 3)))

    // the chant: an octave below as written (men's voices), in octaves later
    let beat = 0
    phrase.forEach(([pitch, beats]) => {
      const start = at + beat * BEAT
      const duration = beats * BEAT
      this.sounding.push(this.sung(midi(pitch - 12), start, duration, 0.07))
      if (shot >= 5) this.sounding.push(this.sung(midi(pitch), start, duration, 0.035))
      if (shot === 6) this.sounding.push(this.sung(midi(pitch), start, duration, 0.04))
      if (shot === 6 && beat >= 4) chord.notes.slice(1).forEach((note) => this.sounding.push(this.sung(midi(note), start, duration, 0.045)))
      beat += beats
    })

    // the drums
    if (shot >= 3) {
      for (let b = 0; b < PHRASE; b += 1) {
        const strong = b % 4 === 0
        const play = shot === 3 ? b === 0 : shot === 4 ? strong : shot === 5 ? b % 2 === 0 : strong
        if (play) this.drum(at + b * BEAT, strong ? 1 : 0.6, shot === 6 ? 1.6 : 1)
      }
      if (shot === 5) this.drum(at + 7.5 * BEAT, 0.45, 0.8)
    }
    // the driving strings: eighth notes on the bass and its fifth
    if (shot === 4 || shot === 5) {
      for (let i = 0; i < PHRASE * 2; i += 1) {
        const note = chord.bass + 12 + (i % 4 === 3 ? 7 : 0)
        this.short(midi(note), at + i * BEAT * 0.5, BEAT * 0.42, (i % 2 === 0 ? 0.07 : 0.05) * (shot === 5 ? 1.2 : 1))
      }
    }
  }

  /* a sung note: four voices a few cents apart, a slow vibrato that
     comes in as the note settles, a soft attack */
  private sung(frequency: number, at: number, duration: number, level: number): Voice {
    const ctx = this.ctx
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(level, at + 0.35)
    gain.gain.setValueAtTime(level, at + duration)
    gain.gain.linearRampToValueAtTime(0, at + duration + 0.5)
    gain.connect(this.choir)
    const vibrato = ctx.createOscillator()
    vibrato.frequency.value = 4.8 + Math.random() * 0.6
    const depth = ctx.createGain()
    depth.gain.setValueAtTime(0, at)
    depth.gain.linearRampToValueAtTime(9, at + 0.9)
    vibrato.connect(depth)
    vibrato.start(at)
    const voices = [-11, -4, 4, 12].map((cents) => {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = frequency
      osc.detune.value = cents
      depth.connect(osc.detune)
      osc.connect(gain)
      osc.start(at)
      osc.stop(at + duration + 0.6)
      return osc
    })
    vibrato.stop(at + duration + 0.6)
    return {
      stop: (end: number) => {
        const now = ctx.currentTime
        if (now >= at + duration + 0.5) return
        gain.gain.cancelScheduledValues(now)
        gain.gain.setValueAtTime(now < at ? 0 : gain.gain.value, now)
        gain.gain.linearRampToValueAtTime(0, end)
        voices.forEach((osc) => osc.stop(end + 0.05))
        vibrato.stop(end + 0.05)
      },
    }
  }

  /* a bowed string note, held */
  private bowed(frequency: number, at: number, duration: number, level: number, attack: number): Voice {
    const ctx = this.ctx
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(level, at + attack)
    gain.gain.setValueAtTime(level, at + duration)
    gain.gain.linearRampToValueAtTime(0, at + duration + 0.8)
    gain.connect(this.strings)
    const oscillators = [-6, 6].map((cents) => {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = frequency
      osc.detune.value = cents
      osc.connect(gain)
      osc.start(at)
      osc.stop(at + duration + 0.9)
      return osc
    })
    return {
      stop: (end: number) => {
        const now = ctx.currentTime
        if (now >= at + duration + 0.8) return
        gain.gain.cancelScheduledValues(now)
        gain.gain.setValueAtTime(now < at ? 0 : gain.gain.value, now)
        gain.gain.linearRampToValueAtTime(0, end)
        oscillators.forEach((osc) => osc.stop(end + 0.05))
      },
    }
  }

  /* a short, driving string note */
  private short(frequency: number, at: number, duration: number, level: number) {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = frequency
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(level, at + 0.02)
    gain.gain.setTargetAtTime(level * 0.5, at + 0.04, 0.08)
    gain.gain.setTargetAtTime(0, at + duration, 0.03)
    osc.connect(gain).connect(this.strings)
    osc.start(at)
    osc.stop(at + duration + 0.2)
  }

  /* a deep drum: a falling tone and a thud of noise */
  private drum(at: number, level: number, size: number) {
    const ctx = this.ctx
    const body = ctx.createOscillator()
    body.type = 'sine'
    body.frequency.setValueAtTime(95 / size, at)
    body.frequency.exponentialRampToValueAtTime(38 / size, at + 0.45)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(0.75 * level, at + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.4 * size)
    body.connect(gain).connect(this.drums)
    body.start(at)
    body.stop(at + 1.5 * size)

    const length = Math.floor(ctx.sampleRate * 0.25)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 4)
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    const thud = ctx.createBiquadFilter()
    thud.type = 'lowpass'
    thud.frequency.value = 380
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0.45 * level
    noise.connect(thud).connect(noiseGain).connect(this.drums)
    noise.start(at)
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
        data[i] = last * Math.pow(1 - k, 2.2)
      }
    }
    return buffer
  }
}

/** the ambient soundtrack steps back while the film's score plays */
export const FILM_SCORE_EVENT = 'urniverse-film-score'
