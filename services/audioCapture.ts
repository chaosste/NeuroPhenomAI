/** Shared mic capture helpers for Gemini Live STT/TTS paths. */

export interface AudioInputSettings {
  audioInputDeviceId?: string;
  studioMicMode?: boolean;
}

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

export const buildAudioConstraints = (
  settings: AudioInputSettings = {}
): MediaTrackConstraints => {
  const studio = Boolean(settings.studioMicMode);
  const constraints: MediaTrackConstraints = {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: !studio,
    autoGainControl: !studio,
    sampleRate: 16000
  };
  if (settings.audioInputDeviceId) {
    constraints.deviceId = { exact: settings.audioInputDeviceId };
  }
  return constraints;
};

export const getMicrophoneStream = async (
  settings: AudioInputSettings = {}
): Promise<MediaStream> => {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: buildAudioConstraints(settings)
    });
  } catch (err) {
    // Device may have been unplugged; retry with default input.
    if (settings.audioInputDeviceId) {
      return navigator.mediaDevices.getUserMedia({
        audio: buildAudioConstraints({ ...settings, audioInputDeviceId: undefined })
      });
    }
    throw err;
  }
};

export const listAudioInputDevices = async (): Promise<AudioDeviceOption[]> => {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Microphone ${i + 1}`
    }));
};

/** Request a short-lived permission grant so device labels become visible. */
export const ensureMicPermission = async (
  settings: AudioInputSettings = {}
): Promise<void> => {
  const stream = await getMicrophoneStream(settings);
  stream.getTracks().forEach((t) => t.stop());
};

export const pickRecorderMimeType = (): string => {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return '';
};

export const createPcmBlob = (
  data: Float32Array
): { data: string; mimeType: string } => {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  let binary = '';
  const bytes = new Uint8Array(int16.buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return {
    data: btoa(binary),
    mimeType: 'audio/pcm;rate=16000'
  };
};

export const createAudioContext = (sampleRate: number): AudioContext => {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctx({ sampleRate });
};

/** RMS level 0–1 from a MediaStream (for UI meters). */
export class InputLevelMonitor {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private raf = 0;
  private data: Uint8Array<ArrayBuffer> | null = null;

  start(stream: MediaStream, onLevel: (level: number) => void) {
    this.stop();
    this.ctx = createAudioContext(16000);
    this.source = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.source.connect(this.analyser);
    this.data = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

    const tick = () => {
      if (!this.analyser || !this.data) return;
      this.analyser.getByteTimeDomainData(this.data);
      let sum = 0;
      for (let i = 0; i < this.data.length; i++) {
        const v = (this.data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.data.length);
      onLevel(Math.min(1, rms * 3));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    try {
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    this.source = null;
    this.analyser = null;
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
    this.data = null;
  }
}
