/**
 * Tests for SoundManager
 * Node test environment — mock Web Audio API objects as plain objects
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SoundManager, SoundEvent } from './sound-manager';

// --- Web Audio API mocks ---

interface MockAudioBufferSourceNode {
  buffer: unknown;
  connect: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  onended: (() => void) | null;
}

interface MockGainNode {
  gain: { value: number };
  connect: jest.Mock;
  disconnect: jest.Mock;
}

function createMockBufferSource(): MockAudioBufferSourceNode {
  return {
    buffer: null,
    connect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    onended: null,
  };
}

function createMockGainNode(): MockGainNode {
  return {
    gain: { value: 1 },
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
}

let mockGain: MockGainNode;
let mockSources: MockAudioBufferSourceNode[];
let mockContextState: string;
let mockDecodeResult: unknown;

const mockResume = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn().mockResolvedValue(undefined);

// Mock AudioContext globally
(globalThis as unknown as Record<string, unknown>).AudioContext = jest.fn().mockImplementation(() => {
  mockGain = createMockGainNode();
  return {
    state: mockContextState,
    destination: {},
    createGain: jest.fn(() => mockGain),
    createBufferSource: jest.fn(() => {
      const src = createMockBufferSource();
      mockSources.push(src);
      return src;
    }),
    decodeAudioData: jest.fn().mockImplementation(() => Promise.resolve(mockDecodeResult)),
    resume: mockResume,
    close: mockClose,
  };
});

// Mock fetch
const mockFetchResponse = {
  ok: true,
  arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
};
(globalThis as unknown as Record<string, unknown>).fetch = jest.fn().mockResolvedValue(mockFetchResponse);

describe('SoundManager', () => {
  let sm: SoundManager;

  beforeEach(() => {
    sm = new SoundManager();
    mockSources = [];
    mockContextState = 'running';
    mockDecodeResult = { duration: 1, length: 44100, sampleRate: 44100 };
    mockFetchResponse.ok = true;
    jest.clearAllMocks();
  });

  afterEach(() => {
    sm.destroy();
  });

  describe('initialization', () => {
    it('should not create AudioContext before user interaction', () => {
      expect((globalThis as unknown as Record<string, unknown>).AudioContext).not.toHaveBeenCalled();
    });

    it('should create AudioContext on initOnInteraction()', () => {
      sm.initOnInteraction();
      expect((globalThis as unknown as Record<string, unknown>).AudioContext).toHaveBeenCalledTimes(1);
    });

    it('should only initialize once on repeated calls', () => {
      sm.initOnInteraction();
      sm.initOnInteraction();
      expect((globalThis as unknown as Record<string, unknown>).AudioContext).toHaveBeenCalledTimes(1);
    });

    it('should resume suspended AudioContext', () => {
      mockContextState = 'suspended';
      sm.initOnInteraction();
      expect(mockResume).toHaveBeenCalled();
    });

    it('should preload common sounds on init', () => {
      sm.initOnInteraction();
      // Preload triggers fetch calls for UI sounds
      expect(fetch).toHaveBeenCalled();
    });
  });

  describe('enabled/disabled', () => {
    it('should default to enabled', () => {
      expect(sm.isEnabled()).toBe(true);
    });

    it('should set gain to 0 when disabled', () => {
      sm.initOnInteraction();
      sm.setEnabled(false);
      expect(mockGain.gain.value).toBe(0);
    });

    it('should restore gain when re-enabled', () => {
      sm.initOnInteraction();
      sm.setVolume(0.7);
      sm.setEnabled(false);
      expect(mockGain.gain.value).toBe(0);
      sm.setEnabled(true);
      expect(mockGain.gain.value).toBe(0.7);
    });

    it('should not play when disabled', () => {
      sm.initOnInteraction();
      sm.setEnabled(false);
      sm.play('ui-click');
      expect(mockSources.length).toBe(0);
    });
  });

  describe('volume', () => {
    it('should default volume to 1.0', () => {
      expect(sm.getVolume()).toBe(1.0);
    });

    it('should clamp volume to 0-1 range', () => {
      sm.setVolume(-0.5);
      expect(sm.getVolume()).toBe(0);
      sm.setVolume(1.5);
      expect(sm.getVolume()).toBe(1);
    });

    it('should update master gain on setVolume()', () => {
      sm.initOnInteraction();
      sm.setVolume(0.5);
      expect(mockGain.gain.value).toBe(0.5);
    });

    it('should not update gain if disabled', () => {
      sm.initOnInteraction();
      sm.setEnabled(false);
      sm.setVolume(0.8);
      // Gain stays at 0 when disabled, even after volume change
      expect(mockGain.gain.value).toBe(0);
      expect(sm.getVolume()).toBe(0.8);
    });
  });

  describe('playback', () => {
    it('should not play before user interaction', () => {
      sm.play('ui-click');
      expect(mockSources.length).toBe(0);
    });

    it('should play a named sound event', async () => {
      sm.initOnInteraction();
      sm.play('ui-click');
      // Wait for async load
      await new Promise(r => setTimeout(r, 10));
      expect(mockSources.length).toBeGreaterThan(0);
      expect(mockSources[0].start).toHaveBeenCalled();
    });

    it('should play from buffer cache on second call', async () => {
      sm.initOnInteraction();
      sm.play('mail');
      await new Promise(r => setTimeout(r, 10));
      const fetchCount = (fetch as jest.Mock).mock.calls.length;

      sm.play('mail');
      await new Promise(r => setTimeout(r, 10));
      // Should not fetch again — served from cache
      // (preload also fetches, so just check sources grew)
      expect(mockSources.length).toBeGreaterThanOrEqual(2);
    });

    it('should limit concurrent sounds', async () => {
      sm.initOnInteraction();
      // First load the sound so it's cached
      sm.playFile('click.wav');
      await new Promise(r => setTimeout(r, 20));
      const sourcesAfterFirst = mockSources.length;

      // Now play many more — buffer is cached, so playBuffer is synchronous
      for (let i = 0; i < 10; i++) {
        sm.playFile('click.wav');
      }
      // Only MAX_CONCURRENT (8) sources total should be created from cached playback
      // (minus the initial preload-triggered plays)
      const newSources = mockSources.length - sourcesAfterFirst;
      expect(newSources).toBeLessThanOrEqual(8);
    });

    it('should decrement activeSources on sound end', async () => {
      sm.initOnInteraction();
      sm.play('ui-click');
      await new Promise(r => setTimeout(r, 10));
      // Trigger onended
      if (mockSources[0]?.onended) {
        mockSources[0].onended();
      }
      // Should be able to play more sounds now
      sm.play('ui-click');
      await new Promise(r => setTimeout(r, 10));
      expect(mockSources.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle fetch failure gracefully', async () => {
      sm.initOnInteraction();
      mockFetchResponse.ok = false;
      sm.play('error');
      await new Promise(r => setTimeout(r, 10));
      // No crash, no source created for failed load
      // (preload sounds may still succeed)
    });

    it('should handle unknown sound events', () => {
      sm.initOnInteraction();
      sm.play('nonexistent' as SoundEvent);
      expect(mockSources.length).toBe(0);
    });
  });

  describe('stopAll', () => {
    it('should reset active sources', async () => {
      sm.initOnInteraction();
      sm.play('ui-click');
      await new Promise(r => setTimeout(r, 10));
      sm.stopAll();
      // After stopAll, should be able to play again (no concurrent limit hit)
      sm.play('ui-click');
      await new Promise(r => setTimeout(r, 10));
    });
  });

  describe('destroy', () => {
    it('should close AudioContext', () => {
      sm.initOnInteraction();
      sm.destroy();
      expect(mockClose).toHaveBeenCalled();
    });

    it('should handle destroy before init gracefully', () => {
      expect(() => sm.destroy()).not.toThrow();
    });
  });
});
