/**
 * Mono 16 kHz PCM capture for Gemini Live.
 * Prefers AudioWorklet; falls back to ScriptProcessor with a silent sink
 * (never routes mic audio to speakers).
 */
import { createPcmBlob } from './audioCapture';

const WORKLET_NAME = 'neuro-pcm-capture-processor';

const WORKLET_SOURCE = `
class NeuroPcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length) {
      const channel = input[0];
      const copy = new Float32Array(channel.length);
      copy.set(channel);
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor('${WORKLET_NAME}', NeuroPcmCaptureProcessor);
`;

export type PcmChunkHandler = (pcm: { data: string; mimeType: string }) => void;

export interface PcmCaptureHandle {
  stop: () => void;
}

let workletBlobUrl: string | null = null;

const getWorkletUrl = (): string => {
  if (!workletBlobUrl) {
    workletBlobUrl = URL.createObjectURL(
      new Blob([WORKLET_SOURCE], { type: 'application/javascript' })
    );
  }
  return workletBlobUrl;
};

const startScriptProcessorCapture = (
  ctx: AudioContext,
  stream: MediaStream,
  onPcm: PcmChunkHandler
): PcmCaptureHandle => {
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const silent = ctx.createGain();
  silent.gain.value = 0;

  processor.onaudioprocess = (e) => {
    onPcm(createPcmBlob(e.inputBuffer.getChannelData(0)));
  };

  source.connect(processor);
  // Keep the processor graph alive without audible mic monitor.
  processor.connect(silent);
  silent.connect(ctx.destination);

  return {
    stop: () => {
      try {
        processor.disconnect();
        silent.disconnect();
        source.disconnect();
      } catch {
        /* ignore */
      }
      processor.onaudioprocess = null;
    }
  };
};

export const startPcmCapture = async (
  ctx: AudioContext,
  stream: MediaStream,
  onPcm: PcmChunkHandler
): Promise<PcmCaptureHandle> => {
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => undefined);
  }

  if (typeof ctx.audioWorklet?.addModule === 'function') {
    try {
      await ctx.audioWorklet.addModule(getWorkletUrl());
      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1
      });
      const silent = ctx.createGain();
      silent.gain.value = 0;
      node.port.onmessage = (ev: MessageEvent<Float32Array>) => {
        if (ev.data?.length) onPcm(createPcmBlob(ev.data));
      };
      source.connect(node);
      node.connect(silent);
      silent.connect(ctx.destination);
      return {
        stop: () => {
          try {
            node.port.onmessage = null;
            node.disconnect();
            silent.disconnect();
            source.disconnect();
          } catch {
            /* ignore */
          }
        }
      };
    } catch (err) {
      console.warn('AudioWorklet unavailable; using ScriptProcessor fallback.', err);
    }
  }

  return startScriptProcessorCapture(ctx, stream, onPcm);
};
