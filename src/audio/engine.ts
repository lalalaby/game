// Procedural Web Audio: all music & SFX synthesized at runtime (no assets).

export type SfxName =
  | 'launch' | 'thud' | 'shatter' | 'explosion' | 'crumble'
  | 'stretch' | 'click' | 'score' | 'victory' | 'defeat' | 'birdHit';

const NOTE = (n: number): number => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  musicOn = true;
  sfxOn = true;

  private musicTimer: number | null = null;
  private musicStep = 0;
  private nextNoteTime = 0;
  private musicSeed = 0;
  private leadA: number[] = [];
  private leadB: number[] = [];
  private themeBpm = 112;
  private currentTrack: 'theme' | 'victory' | 'defeat' | null = null;

  /** Must be called from a user gesture. */
  ensure(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    }
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.38;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 10;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.008;
    comp.release.value = 0.22;
    this.musicBus.connect(comp);
    comp.connect(this.master);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.85;
    this.sfxBus.connect(this.master);
    // shared noise buffer (2s white noise)
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  get ready(): boolean { return this.ctx !== null; }

  private noiseSource(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noiseBuf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    return src;
  }

  private env(peak: number, attack: number, decay: number): GainNode | null {
    if (!this.ctx) return null;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private tone(opts: { freq: number; type?: OscillatorType; peak?: number; attack?: number; decay?: number; slideTo?: number; bus?: GainNode | null }): void {
    if (!this.ctx) return;
    const { freq, type = 'sine', peak = 0.3, attack = 0.005, decay = 0.2, slideTo, bus = this.sfxBus } = opts;
    if (!bus || !this.sfxOn) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), this.ctx.currentTime + attack + decay);
    const g = this.env(peak, attack, decay);
    if (!g) return;
    osc.connect(g).connect(bus);
    osc.start();
    osc.stop(this.ctx.currentTime + attack + decay + 0.05);
  }

  private noise(opts: { peak?: number; decay?: number; filterType?: BiquadFilterType; filterFreq?: number; q?: number; slideTo?: number; bus?: GainNode | null }): void {
    if (!this.ctx) return;
    const { peak = 0.4, decay = 0.25, filterType = 'lowpass', filterFreq = 1200, q = 1, slideTo, bus = this.sfxBus } = opts;
    if (!bus || !this.sfxOn) return;
    const src = this.noiseSource();
    if (!src) return;
    const t = this.ctx.currentTime;
    const filt = this.ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.setValueAtTime(filterFreq, t);
    filt.Q.value = q;
    if (slideTo !== undefined) filt.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + decay);
    const g = this.env(peak, 0.004, decay);
    if (!g) return;
    src.connect(filt).connect(g).connect(bus);
    src.start(t, Math.random());
    src.stop(t + decay + 0.1);
  }

  play(name: SfxName, intensity = 1): void {
    if (!this.ensure() || !this.sfxOn) return;
    const k = Math.max(0.15, Math.min(1.6, intensity));
    switch (name) {
      case 'launch':
        this.noise({ peak: 0.35 * k, decay: 0.35, filterType: 'bandpass', filterFreq: 900, q: 2, slideTo: 2600 });
        this.tone({ freq: 180, type: 'triangle', peak: 0.25 * k, decay: 0.3, slideTo: 420 });
        break;
      case 'stretch':
        this.tone({ freq: 90 + 160 * k, type: 'sawtooth', peak: 0.05, attack: 0.01, decay: 0.08 });
        break;
      case 'thud':
        this.tone({ freq: 120, type: 'sine', peak: 0.5 * k, decay: 0.16, slideTo: 45 });
        this.noise({ peak: 0.2 * k, decay: 0.08, filterFreq: 500 });
        break;
      case 'birdHit':
        this.tone({ freq: 300, type: 'square', peak: 0.18 * k, decay: 0.09, slideTo: 140 });
        break;
      case 'shatter': {
        this.noise({ peak: 0.5 * k, decay: 0.4, filterType: 'highpass', filterFreq: 2400, q: 0.7 });
        for (let i = 0; i < 6; i++) {
          const f = NOTE(84 + Math.floor(Math.random() * 12));
          setTimeout(() => this.tone({ freq: f, type: 'sine', peak: 0.12 * k, decay: 0.25 }), i * 28);
        }
        break;
      }
      case 'crumble':
        this.noise({ peak: 0.4 * k, decay: 0.5, filterType: 'lowpass', filterFreq: 900, slideTo: 180 });
        this.tone({ freq: 70, type: 'sine', peak: 0.35 * k, decay: 0.4, slideTo: 32 });
        break;
      case 'explosion':
        this.noise({ peak: 0.7 * k, decay: 0.8, filterType: 'lowpass', filterFreq: 1600, slideTo: 90 });
        this.tone({ freq: 60, type: 'sine', peak: 0.6 * k, decay: 0.7, slideTo: 28 });
        this.tone({ freq: 130, type: 'triangle', peak: 0.3 * k, decay: 0.5, slideTo: 40 });
        break;
      case 'click':
        this.tone({ freq: 660, type: 'square', peak: 0.12, decay: 0.05 });
        break;
      case 'score':
        this.tone({ freq: NOTE(76), type: 'triangle', peak: 0.2, decay: 0.12 });
        setTimeout(() => this.tone({ freq: NOTE(81), type: 'triangle', peak: 0.2, decay: 0.18 }), 70);
        break;
      case 'victory': {
        const seq = [64, 67, 71, 76, 79];
        seq.forEach((n, i) => setTimeout(() => this.tone({ freq: NOTE(n), type: 'triangle', peak: 0.28, decay: 0.3 }), i * 110));
        setTimeout(() => this.tone({ freq: NOTE(81), type: 'triangle', peak: 0.3, decay: 0.7 }), seq.length * 110);
        break;
      }
      case 'defeat': {
        const seq = [64, 62, 59, 55];
        seq.forEach((n, i) => setTimeout(() => this.tone({ freq: NOTE(n), type: 'sawtooth', peak: 0.2, decay: 0.35 }), i * 170));
        break;
      }
    }
  }
  // ---------------------------------------------------------------------
  // Music: D-minor partisan cue — pads, ostinato, lead, light kit
  // ---------------------------------------------------------------------

  /** 8 bars of 8ths. 0 = rest. */
  private static readonly THEME_LEAD = [
    62, 0, 0, 0, 65, 0, 69, 0, 67, 0, 65, 0, 0, 0, 64, 0,
    65, 0, 67, 0, 69, 0, 72, 0, 69, 0, 67, 0, 65, 0, 0, 0,
    74, 0, 72, 0, 69, 0, 67, 0, 65, 0, 64, 0, 62, 0, 0, 0,
    64, 0, 65, 0, 67, 0, 69, 0, 67, 0, 65, 0, 62, 0, 0, 0,
  ];
  private static readonly THEME_LEAD_B = [
    69, 0, 0, 0, 72, 0, 74, 0, 72, 0, 69, 0, 0, 0, 67, 0,
    69, 0, 71, 0, 72, 0, 76, 0, 74, 0, 72, 0, 69, 0, 0, 0,
    77, 0, 76, 0, 74, 0, 72, 0, 69, 0, 67, 0, 65, 0, 0, 0,
    67, 0, 69, 0, 72, 0, 74, 0, 72, 0, 69, 0, 62, 0, 0, 0,
  ];
  private static readonly THEME_BASS = [
    38, 0, 38, 0, 38, 41, 38, 0,
    46, 0, 46, 0, 46, 48, 46, 0,
    48, 0, 48, 0, 48, 50, 48, 0,
    45, 0, 45, 0, 43, 45, 38, 0,
  ];
  /** Dm  Bb  C  Am */
  private static readonly THEME_CHORDS: number[][] = [
    [50, 53, 57],
    [46, 50, 53],
    [48, 52, 55],
    [45, 48, 52],
  ];
  private static readonly VICTORY_LEAD = [72, 0, 76, 0, 79, 0, 84, 0, 79, 0, 84, 0, 88, 0, 84, 76];
  private static readonly VICTORY_CHORD = [60, 64, 67, 72];
  private static readonly DEFEAT_LEAD = [69, 0, 0, 0, 67, 0, 0, 0, 65, 0, 0, 0, 62, 0, 57, 0];
  private static readonly DEFEAT_CHORD = [50, 53, 57];

  startMusic(track: 'theme' | 'victory' | 'defeat', seed?: number): void {
    const s = seed ?? this.musicSeed;
    if (this.currentTrack === track && this.musicTimer !== null && (track !== 'theme' || s === this.musicSeed)) return;
    if (!this.ensure()) return;
    this.stopMusic();
    if (!this.musicOn || !this.ctx || !this.musicBus) return;
    this.musicSeed = s;
    this.currentTrack = track;
    this.musicStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.08;
    if (track === 'theme') this.cookTheme(s);
    const bpm = track === 'theme' ? this.themeBpm : track === 'victory' ? 128 : 76;
    const stepDur = 60 / bpm / 2;
    this.musicTimer = window.setInterval(() => this.schedule(stepDur), 30);
  }

  private cookTheme(seed: number): void {
    let a = (seed || 1) >>> 0;
    const rng = (): number => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.themeBpm = 108 + Math.floor(rng() * 9);
    const swap = rng() < 0.35;
    const aVar = this.varyLead(AudioEngine.THEME_LEAD, rng);
    const bVar = this.varyLead(AudioEngine.THEME_LEAD_B, rng);
    this.leadA = swap ? bVar : aVar;
    this.leadB = swap ? aVar : bVar;
  }

  private varyLead(src: readonly number[], rng: () => number): number[] {
    const scale = [50, 52, 53, 55, 57, 58, 60, 62, 64, 65, 67, 69, 70, 72, 74, 76, 77, 79];
    return src.map((n, i) => {
      if (n === 0 || i % 8 === 0 || rng() > 0.3) return n;
      let idx = scale.indexOf(n);
      if (idx < 0) {
        idx = 0;
        while (idx < scale.length - 1 && scale[idx]! < n) idx++;
      }
      const dir = rng() < 0.5 ? -1 : 1;
      return scale[Math.max(0, Math.min(scale.length - 1, idx + dir))]!;
    });
  }

  stopMusic(): void {
    if (this.musicTimer !== null) { clearInterval(this.musicTimer); this.musicTimer = null; }
    this.currentTrack = null;
  }

  private schedule(stepDur: number): void {
    if (!this.ctx || !this.musicBus || !this.currentTrack) return;
    const lookahead = 0.14;
    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
      this.scheduleStep(this.musicStep, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.musicStep++;
    }
  }

  private scheduleStep(step: number, time: number, stepDur: number): void {
    if (!this.ctx || !this.musicBus || !this.currentTrack) return;
    const track = this.currentTrack;
    if (track === 'theme') {
      const leadSrc = Math.floor(step / 64) % 2 === 0
        ? (this.leadA.length ? this.leadA : AudioEngine.THEME_LEAD)
        : (this.leadB.length ? this.leadB : AudioEngine.THEME_LEAD_B);
      const lead = leadSrc[step % 64] ?? 0;
      const bass = AudioEngine.THEME_BASS[step % 32];
      if (lead > 0) {
        const hold = this.holdSteps(leadSrc, step % 64);
        this.musicLead(NOTE(lead), 0.07, stepDur * hold, time);
      }
      if (bass > 0) {
        this.musicBass(NOTE(bass), 0.16, stepDur * 1.85, time);
      }
      if (step % 8 === 0) {
        const chord = AudioEngine.THEME_CHORDS[Math.floor((step % 32) / 8)];
        this.musicPad(chord, 0.028, stepDur * 7.2, time);
      }
      if (step % 8 === 0) this.musicKick(time);
      else if (step % 16 === 10) this.musicKick(time, 0.16);
      if (step % 8 === 4) this.musicSnare(time);
      if (step % 2 === 0) this.musicHat(time, step % 8 === 6 ? 0.045 : 0.022, step % 8 === 6 ? 0.09 : 0.035);
    } else if (track === 'victory') {
      const lead = AudioEngine.VICTORY_LEAD[step % 16];
      if (lead > 0) this.musicLead(NOTE(lead), 0.09, stepDur * 1.8, time);
      if (step % 16 === 0) this.musicPad(AudioEngine.VICTORY_CHORD, 0.04, stepDur * 14, time);
      if (step % 8 === 0) this.musicKick(time, 0.18);
      if (step % 4 === 2) this.musicHat(time, 0.03, 0.05);
    } else {
      const lead = AudioEngine.DEFEAT_LEAD[step % 16];
      if (lead > 0) this.musicBass(NOTE(lead), 0.12, stepDur * 3.4, time);
      if (step % 16 === 0) this.musicPad(AudioEngine.DEFEAT_CHORD, 0.035, stepDur * 14, time);
    }
  }

  private holdSteps(seq: readonly number[], i: number): number {
    let n = 1;
    while (i + n < seq.length && seq[i + n] === 0 && n < 4) n++;
    return n;
  }

  private musicLead(freq: number, peak: number, dur: number, time: number): void {
    if (!this.ctx || !this.musicBus) return;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(2200, time);
    filt.frequency.exponentialRampToValueAtTime(900, time + dur);
    filt.Q.value = 1.1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    for (const [type, detune] of [['triangle', 0], ['sawtooth', 7]] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);
      osc.detune.setValueAtTime(detune, time);
      osc.connect(filt);
      osc.start(time);
      osc.stop(time + dur + 0.05);
    }
    filt.connect(g).connect(this.musicBus);
  }

  private musicBass(freq: number, peak: number, dur: number, time: number): void {
    if (!this.ctx || !this.musicBus) return;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq, time);
    const body = this.ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(freq, time);
    sub.connect(g);
    body.connect(g);
    g.connect(this.musicBus);
    sub.start(time); body.start(time);
    sub.stop(time + dur + 0.04); body.stop(time + dur + 0.04);
  }

  private musicPad(notes: readonly number[], peak: number, dur: number, time: number): void {
    if (!this.ctx || !this.musicBus) return;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(900, time);
    filt.frequency.linearRampToValueAtTime(1400, time + dur * 0.5);
    filt.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    for (const n of notes) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(NOTE(n), time);
      osc.connect(filt);
      osc.start(time);
      osc.stop(time + dur + 0.05);
    }
    filt.connect(g).connect(this.musicBus);
  }

  private musicKick(time: number, peak = 0.26): void {
    if (!this.ctx || !this.musicBus) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    osc.connect(g).connect(this.musicBus);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  private musicSnare(time: number): void {
    if (!this.ctx || !this.musicBus) return;
    const src = this.noiseSource();
    if (!src) return;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 1800;
    filt.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.07, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
    src.connect(filt).connect(g).connect(this.musicBus);
    src.start(time, Math.random());
    src.stop(time + 0.11);
    const tone = this.ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(190, time);
    tone.frequency.exponentialRampToValueAtTime(90, time + 0.08);
    const tg = this.ctx.createGain();
    tg.gain.setValueAtTime(0.06, time);
    tg.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
    tone.connect(tg).connect(this.musicBus);
    tone.start(time);
    tone.stop(time + 0.1);
  }

  private musicHat(time: number, peak = 0.03, dur = 0.04): void {
    if (!this.ctx || !this.musicBus) return;
    const src = this.noiseSource();
    if (!src) return;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(filt).connect(g).connect(this.musicBus);
    src.start(time, Math.random());
    src.stop(time + dur + 0.03);
  }
}
