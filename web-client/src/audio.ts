/**
 * NeoNetrek Audio Engine
 *
 * Synthesized sound effects using the Web Audio API.
 * No audio files needed - all sounds are generated procedurally.
 */

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private volume = 0.3;
  private torpNoiseBuffer: AudioBuffer | null = null;
  private shipNoiseBuffer: AudioBuffer | null = null;

  // Engine hum oscillator graph
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineMixGain1: GainNode | null = null;
  private engineMixGain2: GainNode | null = null;

  private ensureContext() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => { /* autoplay policy - will retry next call */ });
    }
    return this.ctx;
  }

  /** Get or create a cached noise buffer for torpedo explosions */
  private getTorpNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.torpNoiseBuffer || this.torpNoiseBuffer.sampleRate !== ctx.sampleRate) {
      const bufferSize = Math.floor(ctx.sampleRate * 0.15);
      this.torpNoiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = this.torpNoiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
    }
    return this.torpNoiseBuffer;
  }

  /** Get or create a cached noise buffer for ship explosions (1s raw white noise) */
  private getShipNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.shipNoiseBuffer || this.shipNoiseBuffer.sampleRate !== ctx.sampleRate) {
      const bufferSize = Math.floor(ctx.sampleRate * 1.0);
      this.shipNoiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = this.shipNoiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return this.shipNoiseBuffer;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    // Fade engine gain to 0 on mute, restore on unmute (oscillators keep running)
    if (this.engineGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.engineGain.gain.cancelScheduledValues(t);
      this.engineGain.gain.setValueAtTime(this.engineGain.gain.value, t);
      this.engineGain.gain.linearRampToValueAtTime(this.muted ? 0 : this.engineTargetGain, t + 0.05);
    }
    return this.muted;
  }

  private engineTargetGain = 0;

  get isMuted(): boolean {
    return this.muted;
  }

  /** Torpedo fire - short high-pitched blip */
  playTorpFire() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'square';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(this.volume * 0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  }

  /** Phaser fire - sustained laser-like sweep */
  playPhaserFire() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(this.volume * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }

  /** Torpedo explosion - low rumble with noise */
  playTorpExplode() {
    if (this.muted) return;
    const ctx = this.ensureContext();

    // Reuse pre-generated noise buffer
    const noise = ctx.createBufferSource();
    noise.buffer = this.getTorpNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(ctx.currentTime);
    noise.stop(ctx.currentTime + 0.2);
  }

  /** Ship explosion - cinematic multi-layered explosion (~1.5s) */
  playShipExplode() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    const t = ctx.currentTime;
    const vol = this.volume;

    // Layer 1: Initial transient crack (0–50ms)
    {
      const noise = ctx.createBufferSource();
      noise.buffer = this.getShipNoiseBuffer(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2000, t);
      bp.Q.setValueAtTime(2, t);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol * 0.7, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      noise.connect(bp);
      bp.connect(gain);
      gain.connect(ctx.destination);
      noise.start(t);
      noise.stop(t + 0.05);
    }

    // Layer 2: Deep boom (0–800ms)
    {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, t);
      osc.frequency.exponentialRampToValueAtTime(15, t + 0.8);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol * 0.8, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.8);
    }

    // Layer 3: Mid rumble (50–1200ms)
    {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 1.2);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(vol * 0.5, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.2);
    }

    // Layer 4: Noise body with distortion (0–1000ms)
    {
      const noise = ctx.createBufferSource();
      noise.buffer = this.getShipNoiseBuffer(ctx);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2000, t);
      lp.frequency.exponentialRampToValueAtTime(80, t + 1.0);
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 128) - 1;
        curve[i] = (Math.PI + 3) * x / (Math.PI + 3 * Math.abs(x));
      }
      shaper.curve = curve;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol * 0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      noise.connect(lp);
      lp.connect(shaper);
      shaper.connect(gain);
      gain.connect(ctx.destination);
      noise.start(t);
      noise.stop(t + 1.0);
    }

    // Layer 5: Sub-bass tail (200–1500ms)
    {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(30, t);
      osc.frequency.exponentialRampToValueAtTime(10, t + 1.5);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(vol * 0.4, t + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.5);
    }
  }

  /** Plasma fire - deep resonant pulse */
  playPlasmaFire() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(this.volume * 0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  }

  /** Alert sound - red alert beep */
  playAlert() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    gain.gain.setValueAtTime(this.volume * 0.2, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    gain.gain.linearRampToValueAtTime(this.volume * 0.2, ctx.currentTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }

  /** Self-destruct warning - continuous warble */
  playSelfDestruct() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'square';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.setValueAtTime(400, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(600, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(this.volume * 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  }

  /** Start the persistent engine hum oscillator graph. Idempotent. */
  startEngine() {
    if (this.engineOsc1) return; // already running
    const ctx = this.ensureContext();

    // Two triangle oscillators: base + harmonic at 2.5x
    this.engineOsc1 = ctx.createOscillator();
    this.engineOsc1.type = 'triangle';
    this.engineOsc1.frequency.setValueAtTime(40, ctx.currentTime);

    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'triangle';
    this.engineOsc2.frequency.setValueAtTime(100, ctx.currentTime);

    // Individual mix gains
    this.engineMixGain1 = ctx.createGain();
    this.engineMixGain1.gain.setValueAtTime(1, ctx.currentTime);

    this.engineMixGain2 = ctx.createGain();
    this.engineMixGain2.gain.setValueAtTime(0.4, ctx.currentTime); // harmonic quieter

    // Lowpass filter to keep it muffled
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(80, ctx.currentTime);

    // Master gain
    this.engineGain = ctx.createGain();
    this.engineTargetGain = this.volume * 0.06;
    this.engineGain.gain.setValueAtTime(this.muted ? 0 : this.engineTargetGain, ctx.currentTime);

    // Wire: osc1 -> mixGain1 -> filter -> masterGain -> destination
    //        osc2 -> mixGain2 -> filter
    this.engineOsc1.connect(this.engineMixGain1);
    this.engineOsc2.connect(this.engineMixGain2);
    this.engineMixGain1.connect(this.engineFilter);
    this.engineMixGain2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(ctx.destination);

    this.engineOsc1.start(ctx.currentTime);
    this.engineOsc2.start(ctx.currentTime);
  }

  /** Update engine hum parameters based on current speed. Called each frame. */
  updateEngine(speed: number, maxSpeed: number) {
    if (!this.engineOsc1 || !this.ctx) return;

    const t = this.ctx.currentTime;
    const ramp = t + 0.15; // 150ms smooth transition
    const ratio = Math.min(1, Math.max(0, speed / maxSpeed));

    // Frequency: 40 Hz idle -> 120 Hz at max speed
    const baseFreq = 40 + ratio * 80;
    this.engineOsc1.frequency.cancelScheduledValues(t);
    this.engineOsc1.frequency.setValueAtTime(this.engineOsc1.frequency.value, t);
    this.engineOsc1.frequency.linearRampToValueAtTime(baseFreq, ramp);

    this.engineOsc2!.frequency.cancelScheduledValues(t);
    this.engineOsc2!.frequency.setValueAtTime(this.engineOsc2!.frequency.value, t);
    this.engineOsc2!.frequency.linearRampToValueAtTime(baseFreq * 2.5, ramp);

    // Volume: 0.06 idle -> 0.15 at max speed
    this.engineTargetGain = this.volume * (0.06 + ratio * 0.09);
    if (!this.muted) {
      this.engineGain!.gain.cancelScheduledValues(t);
      this.engineGain!.gain.setValueAtTime(this.engineGain!.gain.value, t);
      this.engineGain!.gain.linearRampToValueAtTime(this.engineTargetGain, ramp);
    }

    // Filter cutoff: 80 Hz idle -> 300 Hz at max speed
    const cutoff = 80 + ratio * 220;
    this.engineFilter!.frequency.cancelScheduledValues(t);
    this.engineFilter!.frequency.setValueAtTime(this.engineFilter!.frequency.value, t);
    this.engineFilter!.frequency.linearRampToValueAtTime(cutoff, ramp);
  }

  /** Tear down the engine hum oscillators. Idempotent. */
  stopEngine() {
    if (!this.engineOsc1) return;
    try { this.engineOsc1.stop(); } catch { /* already stopped */ }
    try { this.engineOsc2!.stop(); } catch { /* already stopped */ }
    this.engineOsc1.disconnect();
    this.engineOsc2!.disconnect();
    this.engineMixGain1!.disconnect();
    this.engineMixGain2!.disconnect();
    this.engineFilter!.disconnect();
    this.engineGain!.disconnect();
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineMixGain1 = null;
    this.engineMixGain2 = null;
    this.engineFilter = null;
    this.engineGain = null;
  }
}
