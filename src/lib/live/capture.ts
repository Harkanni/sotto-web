'use client';

import { PCM_WORKLET_NAME, PCM_WORKLET_SOURCE } from './pcm-worklet';

export type LiveInput = 'mic' | 'tab';

/** Why capture couldn't start, in words for the person (the sheet shows it). */
export class CaptureError extends Error {
  constructor(
    message: string,
    readonly code: 'unsupported' | 'mic_denied' | 'no_mic' | 'tab_cancelled' | 'tab_no_audio',
  ) {
    super(message);
    this.name = 'CaptureError';
  }
}

/** What this browser can capture: the microphone almost everywhere; a tab's audio on desktop Chromium. */
export function captureSupport(): { mic: boolean; tab: boolean } {
  if (typeof window === 'undefined') return { mic: false, tab: false };
  const media = navigator.mediaDevices;
  const worklet = typeof AudioWorkletNode !== 'undefined';
  const mic = Boolean(media?.getUserMedia) && worklet;
  // Tab audio: Chrome and Edge on desktop share it; Safari and Firefox share video only, and
  // phones can't share at all. userAgentData is Chromium-only, which is the point.
  const brands = (
    navigator as Navigator & { userAgentData?: { mobile: boolean; brands: { brand: string }[] } }
  ).userAgentData;
  const chromium = Boolean(
    brands?.brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand)),
  );
  const tab = mic && Boolean(media?.getDisplayMedia) && chromium && !brands?.mobile;
  return { mic, tab };
}

export interface CaptureCallbacks {
  /** ~4 s of 16 kHz mono PCM16, in order. */
  onChunk(pcm: ArrayBuffer): void;
  /** 0–1, about 20 times a second, for the waveform. */
  onLevel(level: number): void;
  /** The shared tab stopped (the person clicked Stop sharing, or closed it); the mic carries on. */
  onTabEnded(): void;
  /** The microphone went away (unplugged, or the OS took it). */
  onMicEnded(): void;
}

/**
 * One live capture: the microphone, and optionally a call's tab audio, mixed in one AudioContext
 * into the PCM worklet. Echo cancellation stays on, so a call playing through the speakers isn't
 * heard twice when its tab is captured too.
 */
export class LiveCapture {
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private streams: MediaStream[] = [];
  private flushed: (() => void) | null = null;

  constructor(private readonly callbacks: CaptureCallbacks) {}

  /** Asks for permissions and starts. Returns what's actually being captured. */
  async start(options: { tab: boolean }): Promise<LiveInput[]> {
    const support = captureSupport();
    if (!support.mic) {
      throw new CaptureError(
        'This browser can’t listen live. Use a recent Chrome, Edge, Safari or Firefox.',
        'unsupported',
      );
    }
    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (error) {
      const denied =
        error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name);
      throw new CaptureError(
        denied
          ? 'Sotto can’t use the microphone. Allow it for this site in your browser’s settings, then try again.'
          : 'No microphone was found. Connect one and try again.',
        denied ? 'mic_denied' : 'no_mic',
      );
    }
    this.streams.push(mic);

    let tab: MediaStream | null = null;
    if (options.tab && support.tab) {
      try {
        // Chrome requires video to share a tab; it's stopped at once, keeping only the audio.
        tab = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
          // Chromium hints: offer tabs first, keep the call audible for you, never this tab.
          ...({
            preferCurrentTab: false,
            selfBrowserSurface: 'exclude',
            systemAudio: 'include',
            surfaceSwitching: 'include',
          } as object),
        });
      } catch {
        this.close();
        throw new CaptureError(
          'Choose the tab with your call to include its audio, or listen with the microphone only.',
          'tab_cancelled',
        );
      }
      if (!tab.getAudioTracks().length) {
        tab.getTracks().forEach((t) => t.stop());
        this.close();
        throw new CaptureError(
          'That share has no sound. Pick the call’s tab and turn on “Also share tab audio”.',
          'tab_no_audio',
        );
      }
      tab.getVideoTracks().forEach((t) => t.stop());
      this.streams.push(tab);
    }

    const context = new AudioContext({ latencyHint: 'playback' });
    this.context = context;
    const url = URL.createObjectURL(new Blob([PCM_WORKLET_SOURCE], { type: 'text/javascript' }));
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(context, PCM_WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
      processorOptions: { chunkMs: 4_000 },
    });
    node.port.onmessage = (
      event: MessageEvent<{ type: string; pcm?: ArrayBuffer; level?: number }>,
    ) => {
      if (event.data.type === 'chunk' && event.data.pcm) {
        this.callbacks.onChunk(event.data.pcm);
        this.flushed?.();
      } else if (event.data.type === 'level') {
        this.callbacks.onLevel(Math.min(1, Math.sqrt(event.data.level ?? 0) * 1.2));
      }
    };
    // Both sources into one input: the graph sums them (the call and you, in one track).
    context.createMediaStreamSource(mic).connect(node);
    if (tab) context.createMediaStreamSource(tab).connect(node);
    // A node only runs while the graph pulls it: through a muted gain to the speakers, so it's
    // processed in every browser and nothing is heard twice.
    const mute = context.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(context.destination);
    this.node = node;

    mic.getAudioTracks()[0]?.addEventListener('ended', () => this.callbacks.onMicEnded());
    tab?.getAudioTracks()[0]?.addEventListener('ended', () => this.callbacks.onTabEnded());
    if (context.state === 'suspended') await context.resume();
    return tab ? ['mic', 'tab'] : ['mic'];
  }

  pause(): void {
    this.node?.port.postMessage('pause');
  }

  resume(): void {
    void this.context?.resume();
    this.node?.port.postMessage('resume');
  }

  /** Sends what's buffered (the last seconds), then releases the microphone and the tab. */
  async stop(): Promise<void> {
    if (this.node) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 500); // nothing buffered: no chunk comes back
        this.flushed = () => {
          clearTimeout(timer);
          resolve();
        };
        this.node!.port.postMessage('flush');
      });
      this.flushed = null;
    }
    this.close();
  }

  private close(): void {
    this.node?.disconnect();
    this.node = null;
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    this.streams = [];
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
