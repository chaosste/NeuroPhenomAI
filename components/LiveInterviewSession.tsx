import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Settings, SpeakerSegment } from '../types';
import { NEURO_PHENOM_SYSTEM_INSTRUCTION } from '../constants';
import Button from './Button';
import { AudioLines, Globe } from 'lucide-react';
import {
  createAudioContext,
  getMicrophoneStream,
  InputLevelMonitor,
  pickRecorderMimeType
} from '../services/audioCapture';
import { startPcmCapture, PcmCaptureHandle } from '../services/pcmCaptureWorklet';
import {
  LIVE_NATIVE_AUDIO_MODEL,
  buildLiveSpeechConfig,
  buildLiveTranscriptionConfig
} from '../services/speechConfig';

interface LiveInterviewSessionProps {
  settings: Settings;
  onComplete: (transcript: SpeakerSegment[], audioBlob?: Blob) => void;
  onCancel: () => void;
}

const LiveInterviewSession: React.FC<LiveInterviewSessionProps> = ({
  settings,
  onComplete,
  onCancel
}) => {
  const [isActive, setIsActive] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<
    { speaker: 'AI' | 'Interviewee'; text: string; id: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [inputLevel, setInputLevel] = useState(0);
  const [diagnostics, setDiagnostics] = useState({
    key: 'unknown',
    mic: 'unknown',
    network: 'unknown',
    session: 'idle',
    message: 'Ready to connect. Use headphones when possible; Chrome recommended.'
  });

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const pcmCaptureRef = useRef<PcmCaptureHandle | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderMimeRef = useRef<string>('audio/webm');
  const audioChunksRef = useRef<Blob[]>([]);
  const levelMonitorRef = useRef<InputLevelMonitor | null>(null);
  const transcriptHistoryRef = useRef<SpeakerSegment[]>([]);

  const currentTurnRef = useRef<{
    speaker: 'AI' | 'Interviewee' | null;
    text: string;
    id: string | null;
  }>({
    speaker: null,
    text: '',
    id: null
  });

  const nextStartTimeRef = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionStartTimeRef = useRef<number>(0);
  const connectTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveTranscript]);

  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, []);

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const decodeAudioData = async (
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number
  ): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  };

  const cleanupAudio = () => {
    if (connectTimeoutRef.current) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    levelMonitorRef.current?.stop();
    levelMonitorRef.current = null;
    pcmCaptureRef.current?.stop();
    pcmCaptureRef.current = null;
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch {
      /* ignore */
    }
    mediaRecorderRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    void inputAudioContextRef.current?.close().catch(() => undefined);
    inputAudioContextRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
  };

  const startLocalRecording = (stream: MediaStream) => {
    audioChunksRef.current = [];
    const mimeType = pickRecorderMimeType();
    recorderMimeRef.current = mimeType || 'audio/webm';
    try {
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      if (rec.mimeType) recorderMimeRef.current = rec.mimeType;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      rec.start(1000);
      mediaRecorderRef.current = rec;
    } catch (err) {
      console.warn('Local MediaRecorder unavailable for live interview.', err);
      mediaRecorderRef.current = null;
    }
  };

  const stopLocalRecording = (): Promise<Blob | undefined> =>
    new Promise((resolve) => {
      const rec = mediaRecorderRef.current;
      if (!rec || rec.state === 'inactive') {
        const blob =
          audioChunksRef.current.length > 0
            ? new Blob(audioChunksRef.current, {
                type: recorderMimeRef.current || 'audio/webm'
              })
            : undefined;
        resolve(blob && blob.size > 0 ? blob : undefined);
        return;
      }
      rec.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorderMimeRef.current || rec.mimeType || 'audio/webm'
        });
        mediaRecorderRef.current = null;
        resolve(blob.size > 0 ? blob : undefined);
      };
      try {
        rec.stop();
      } catch {
        mediaRecorderRef.current = null;
        resolve(undefined);
      }
    });

  const startSession = async () => {
    try {
      if (!settings.apiKey) {
        setError('Missing Gemini API Key');
        setDiagnostics({
          key: 'fail',
          mic: 'unknown',
          network: 'unknown',
          session: 'error',
          message: 'Missing Gemini API key. Add it in settings.'
        });
        return;
      }
      setDiagnostics({
        key: 'ok',
        mic: 'checking',
        network: 'checking',
        session: 'connecting',
        message: 'API key found. Requesting microphone access...'
      });

      if (connectTimeoutRef.current) window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = window.setTimeout(() => {
        setError('Connection timeout. Check Gemini API key, mic permission, or network.');
        setDiagnostics((prev) => ({
          ...prev,
          network: 'fail',
          session: 'error',
          message: 'Connection timeout. Check network/API key and retry.'
        }));
      }, 15000);

      const ai = new GoogleGenAI({ apiKey: settings.apiKey });
      const inputAudioContext = createAudioContext(16000);
      const outputAudioContext = createAudioContext(24000);
      inputAudioContextRef.current = inputAudioContext;
      audioContextRef.current = outputAudioContext;
      sessionStartTimeRef.current = Date.now();

      const stream = await getMicrophoneStream({
        audioInputDeviceId: settings.audioInputDeviceId,
        studioMicMode: settings.studioMicMode
      });
      micStreamRef.current = stream;
      startLocalRecording(stream);

      levelMonitorRef.current = new InputLevelMonitor();
      levelMonitorRef.current.start(stream, setInputLevel);

      setDiagnostics((prev) => ({
        ...prev,
        mic: 'ok',
        message: 'Microphone ready. Opening live model connection...'
      }));
      const outputNode = outputAudioContext.createGain();
      outputNode.gain.value = 0.9;
      outputNode.connect(outputAudioContext.destination);

      const speechConfig = buildLiveSpeechConfig({
        voiceName: settings.voiceName,
        language: settings.language,
        voiceGender: settings.voiceGender
      });
      const transcriptionConfig = buildLiveTranscriptionConfig(settings.language);

      const sessionPromise = ai.live.connect({
        model: LIVE_NATIVE_AUDIO_MODEL,
        callbacks: {
          onopen: () => {
            if (connectTimeoutRef.current) {
              window.clearTimeout(connectTimeoutRef.current);
              connectTimeoutRef.current = null;
            }
            setIsActive(true);
            setDiagnostics({
              key: 'ok',
              mic: 'ok',
              network: 'ok',
              session: 'live',
              message: 'Live session connected. Prefer headphones to reduce echo.'
            });
            void startPcmCapture(inputAudioContext, stream, (pcmBlob) => {
              sessionPromise.then((s) => s.sendRealtimeInput({ media: pcmBlob }));
            }).then((handle) => {
              pcmCaptureRef.current = handle;
            });
          },
          onmessage: async (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              nextStartTimeRef.current = Math.max(
                nextStartTimeRef.current,
                outputAudioContext.currentTime
              );
              const audioBuffer = await decodeAudioData(
                decode(audioData),
                outputAudioContext,
                24000,
                1
              );
              const source = outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNode);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
            }

            if (message.serverContent?.outputTranscription) {
              updateIncrementalTranscript(
                'AI',
                message.serverContent.outputTranscription.text ?? ''
              );
            } else if (message.serverContent?.inputTranscription) {
              updateIncrementalTranscript(
                'Interviewee',
                message.serverContent.inputTranscription.text ?? ''
              );
            }

            if (message.serverContent?.turnComplete) {
              finalizeTurn();
            }
          },
          onerror: (e) => {
            const detail =
              typeof (e as any)?.message === 'string'
                ? (e as any).message
                : 'Unknown transport error';
            setError(`Link interrupt: ${detail}`);
            const lowered = detail.toLowerCase();
            if (
              lowered.includes('key') ||
              lowered.includes('auth') ||
              lowered.includes('permission')
            ) {
              setDiagnostics((prev) => ({
                ...prev,
                key: 'fail',
                session: 'error',
                message: 'API key invalid or unauthorized.'
              }));
            } else {
              setDiagnostics((prev) => ({
                ...prev,
                network: 'fail',
                session: 'error',
                message: 'Network/session link interrupted.'
              }));
            }
          },
          onclose: () => {
            setIsActive(false);
            setDiagnostics((prev) =>
              prev.session === 'error'
                ? prev
                : { ...prev, session: 'closed', message: 'Session closed.' }
            );
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: transcriptionConfig,
          inputAudioTranscription: transcriptionConfig,
          speechConfig,
          systemInstruction: NEURO_PHENOM_SYSTEM_INSTRUCTION(
            settings.language,
            settings.interviewMode,
            settings.privacyContract,
            settings.increasedSensitivityMode
          )
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) {
      cleanupAudio();
      setError('Microphone hardware error or blocked permission.');
      setDiagnostics((prev) => ({
        ...prev,
        mic: 'fail',
        session: 'error',
        message: 'Microphone access blocked or unavailable. Check Settings → Microphone.'
      }));
    }
  };

  const updateIncrementalTranscript = (speaker: 'AI' | 'Interviewee', text: string) => {
    if (currentTurnRef.current.speaker !== speaker) {
      if (currentTurnRef.current.speaker !== null) finalizeTurn();
      currentTurnRef.current = { speaker, text, id: crypto.randomUUID() };
    } else {
      currentTurnRef.current.text += text;
    }

    setLiveTranscript((prev) => {
      const others = prev.filter((m) => m.id !== currentTurnRef.current.id);
      return [...others, { ...currentTurnRef.current } as any];
    });
  };

  const finalizeTurn = () => {
    if (!currentTurnRef.current.text || !currentTurnRef.current.speaker) return;
    const ts = (Date.now() - sessionStartTimeRef.current) / 1000;
    transcriptHistoryRef.current.push({
      speaker: currentTurnRef.current.speaker === 'AI' ? 'AI' : 'Interviewee',
      text: currentTurnRef.current.text,
      startTime: ts
    });
    currentTurnRef.current = { speaker: null, text: '', id: null };
  };

  const endSession = async () => {
    finalizeTurn();
    if (connectTimeoutRef.current) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch {
        /* ignore */
      }
      sessionRef.current = null;
    }
    const audioBlob = await stopLocalRecording();
    cleanupAudio();
    onComplete(transcriptHistoryRef.current, audioBlob);
  };

  return (
    <div className="flex flex-col h-full bg-white text-black border-t border-black">
      <div className="px-8 py-4 border-b border-black flex justify-between items-center bg-white z-10">
        <div className="flex items-center gap-6">
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] flex items-center gap-3">
            <div
              className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-black animate-pulse shadow-[0_0_8px_rgba(0,0,0,0.3)]' : 'bg-neutral-200'}`}
            />
            Synchronous Interface
          </h2>
          {isActive && (
            <div className="flex items-center gap-2 px-3 py-1 bg-neutral-100 border border-black/5 rounded-full">
              <Globe size={10} className="text-black opacity-50" />
              <span className="text-[9px] font-mono font-bold tracking-tighter">
                LATENCY_STABLE
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-4">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Terminate
          </Button>
          {isActive && (
            <Button size="sm" onClick={() => void endSession()}>
              Finalize & Map
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col relative overflow-hidden bg-[#fafafa]">
        <div className="mx-8 mt-6 rounded-xl border border-black/10 bg-white px-4 py-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-bold uppercase tracking-wider">
            <span>
              Key: <strong>{String(diagnostics.key)}</strong>
            </span>
            <span>
              Mic: <strong>{String(diagnostics.mic)}</strong>
            </span>
            <span>
              Network: <strong>{String(diagnostics.network)}</strong>
            </span>
            <span>
              Session: <strong>{String(diagnostics.session)}</strong>
            </span>
          </div>
          <p className="mt-2 text-[11px] text-neutral-600">{diagnostics.message}</p>
          {(isActive || diagnostics.mic === 'ok') && (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
                Input
              </span>
              <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-black transition-[width] duration-75"
                  style={{ width: `${Math.round(inputLevel * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
        {!isActive && !error && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-700">
            <div className="relative mb-16">
              <AudioLines size={80} className="opacity-10" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 border border-black/5 rounded-full animate-ping" />
              </div>
            </div>
            <h3 className="text-4xl font-black uppercase tracking-tighter mb-6 leading-tight">
              Neural Link Initialize
            </h3>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 max-w-sm mb-4 leading-loose">
              Establish interactive neurophenomenology session. Real-time synchronicity and
              structural analysis enabled.
            </p>
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-400 max-w-md mb-12 leading-relaxed">
              Chrome recommended. Select your USB mic in Settings. Prefer wired headphones so AI
              speech does not re-enter the microphone.
            </p>
            <Button size="lg" onClick={() => void startSession()} className="px-12">
              Connect Link
            </Button>
          </div>
        )}

        {isActive && (
          <div className="flex-1 flex flex-col p-8 md:p-16 lg:p-24 overflow-hidden">
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto space-y-16 pr-4 scroll-smooth no-scrollbar"
            >
              {liveTranscript.map((msg, idx) => (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-2xl animate-in slide-in-from-bottom-2 duration-300 ${msg.speaker === 'AI' ? 'mr-auto' : 'ml-auto items-end'}`}
                >
                  <div className="flex items-center gap-3 mb-3 opacity-30">
                    <span className="text-[9px] font-black uppercase tracking-widest">
                      {msg.speaker}
                    </span>
                    <div className="w-8 h-px bg-black" />
                  </div>
                  <div
                    className={`p-8 border-2 ${msg.speaker === 'AI' ? 'bg-white border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.05)]' : 'bg-black text-white border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]'}`}
                  >
                    <p className="text-2xl font-bold leading-tight uppercase tracking-tight font-mono">
                      {msg.text}
                      {idx === liveTranscript.length - 1 && (
                        <span className="inline-block w-2 h-6 bg-current ml-1 animate-pulse" />
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-16 flex items-end justify-center gap-1.5 h-12 px-12">
              {[...Array(40)].map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 bg-black transition-all duration-75"
                  style={{
                    height: `${Math.max(8, inputLevel * 100 * (0.4 + ((i * 17) % 60) / 100))}%`,
                    opacity: 0.08 + inputLevel * 0.35
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-16 border-2 border-black bg-white shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
              <p className="text-[12px] font-black uppercase tracking-widest mb-8 text-red-600">
                LINK_FAILURE: {error}
              </p>
              <Button size="md" onClick={() => window.location.reload()}>
                Reset Protocol
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveInterviewSession;
