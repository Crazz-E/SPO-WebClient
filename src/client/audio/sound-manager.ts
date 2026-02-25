/**
 * SoundManager - Web Audio API wrapper for game sounds
 *
 * Lazy AudioContext creation (requires user interaction per browser policy).
 * Preloads small UI sounds, plays on demand for events.
 */

/** Sound event categories the game can trigger */
export type SoundEvent =
  | 'ui-click'
  | 'ui-select'
  | 'chat-message'
  | 'mail'
  | 'period-end'
  | 'notification'
  | 'error'
  | 'construction';

/** Maps sound events to filenames in cache/Sound/ */
const SOUND_MAP: Record<SoundEvent, string> = {
  'ui-click': 'click.wav',
  'ui-select': 'select.wav',
  'chat-message': 'comm.wav',
  'mail': 'system.wav',
  'period-end': 'bells.wav',
  'notification': 'system.wav',
  'error': 'Explosion.wav',
  'construction': 'Construction.wav',
};

/** Sound events to eagerly preload (small files) */
const PRELOAD_SOUNDS: SoundEvent[] = [
  'ui-click', 'ui-select', 'chat-message', 'mail', 'notification',
];

const MAX_CONCURRENT = 8;

export class SoundManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private loadingPromises: Map<string, Promise<AudioBuffer | null>> = new Map();
  private enabled = true;
  private volume = 1.0;
  private userInteracted = false;
  private activeSources = 0;

  /**
   * Call on first user interaction (click/keydown) to unlock AudioContext.
   */
  public initOnInteraction(): void {
    if (this.userInteracted) return;
    this.userInteracted = true;
    this.ensureContext();
    this.preload();
  }

  /** Enable or disable all sounds */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.masterGain) {
      this.masterGain.gain.value = enabled ? this.volume : 0;
    }
  }

  /** Set master volume (0.0 - 1.0) */
  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.enabled) {
      this.masterGain.gain.value = this.volume;
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  /** Play a named sound event */
  public play(event: SoundEvent): void {
    const filename = SOUND_MAP[event];
    if (!filename) return;
    this.playFile(filename);
  }

  /** Play a specific WAV/MP3 file from cache/Sound/ */
  public playFile(filename: string): void {
    if (!this.enabled || !this.userInteracted) return;
    if (this.activeSources >= MAX_CONCURRENT) return;

    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const buffer = this.bufferCache.get(filename);
    if (buffer) {
      this.playBuffer(ctx, buffer);
    } else {
      // Load and play asynchronously (fire-and-forget for non-blocking)
      this.loadSound(filename).then(buf => {
        if (buf) this.playBuffer(ctx, buf);
      }).catch(() => { /* silently ignore playback failures */ });
    }
  }

  /** Preload common UI sounds */
  public preload(): void {
    for (const event of PRELOAD_SOUNDS) {
      const filename = SOUND_MAP[event];
      if (filename && !this.bufferCache.has(filename) && !this.loadingPromises.has(filename)) {
        this.loadSound(filename).catch(() => { /* ignore preload failures */ });
      }
    }
  }

  /** Stop all currently playing sounds (resets gain briefly) */
  public stopAll(): void {
    if (this.masterGain) {
      this.masterGain.disconnect();
      const ctx = this.context;
      if (ctx) {
        this.masterGain = ctx.createGain();
        this.masterGain.gain.value = this.enabled ? this.volume : 0;
        this.masterGain.connect(ctx.destination);
      }
    }
    this.activeSources = 0;
  }

  /** Clean up resources */
  public destroy(): void {
    this.stopAll();
    if (this.context && this.context.state !== 'closed') {
      this.context.close().catch(() => {});
    }
    this.context = null;
    this.masterGain = null;
    this.bufferCache.clear();
    this.loadingPromises.clear();
  }

  // -- Internal --

  private ensureContext(): AudioContext | null {
    if (!this.userInteracted) return null;

    if (!this.context) {
      try {
        this.context = new AudioContext();
        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = this.enabled ? this.volume : 0;
        this.masterGain.connect(this.context.destination);
      } catch {
        return null;
      }
    }

    // Resume suspended context (browser auto-suspends until user gesture)
    if (this.context.state === 'suspended') {
      this.context.resume().catch(() => {});
    }

    return this.context;
  }

  private async loadSound(filename: string): Promise<AudioBuffer | null> {
    // Deduplicate in-flight requests
    const existing = this.loadingPromises.get(filename);
    if (existing) return existing;

    const promise = this.fetchAndDecode(filename);
    this.loadingPromises.set(filename, promise);

    try {
      const buffer = await promise;
      if (buffer) {
        this.bufferCache.set(filename, buffer);
      }
      return buffer;
    } finally {
      this.loadingPromises.delete(filename);
    }
  }

  private async fetchAndDecode(filename: string): Promise<AudioBuffer | null> {
    const ctx = this.ensureContext();
    if (!ctx) return null;

    try {
      const response = await fetch(`/cache/Sound/${filename}`);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return await ctx.decodeAudioData(arrayBuffer);
    } catch {
      return null;
    }
  }

  private playBuffer(ctx: AudioContext, buffer: AudioBuffer): void {
    if (!this.masterGain) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.masterGain);

    this.activeSources++;
    source.onended = () => {
      this.activeSources = Math.max(0, this.activeSources - 1);
    };

    source.start();
  }
}
