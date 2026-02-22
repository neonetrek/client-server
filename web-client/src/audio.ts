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

  /** Get or create a cached noise buffer for ship explosions */
  private getShipNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.shipNoiseBuffer || this.shipNoiseBuffer.sampleRate !== ctx.sampleRate) {
      const bufferSize = Math.floor(ctx.sampleRate * 0.3);
      this.shipNoiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = this.shipNoiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
    }
    return this.shipNoiseBuffer;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

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

  /** Ship explosion - big boom with rumble */
  playShipExplode() {
    if (this.muted) return;
    const ctx = this.ensureContext();

    // Low-frequency oscillator for the boom
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.5);
    oscGain.gain.setValueAtTime(this.volume * 0.6, ctx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);

    // Reuse pre-generated noise buffer
    const noise = ctx.createBufferSource();
    noise.buffer = this.getShipNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.4);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(ctx.currentTime);
    noise.stop(ctx.currentTime + 0.4);
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
}
