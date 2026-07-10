import React, { useState, useEffect, useRef } from 'react';
import { LiveServerMessage, Modality } from '@google/genai';
import { Mic, Square, Loader2, Activity, Volume2, Wifi, AlertTriangle } from 'lucide-react';
import Button from './Button';
import { Settings } from '../types';
import {
  createAudioContext,
  getMicrophoneStream,
  InputLevelMonitor,
  pickRecorderMimeType
} from '../services/audioCapture';
import { startPcmCapture, PcmCaptureHandle } from '../services/pcmCaptureWorklet';
import {
  LIVE_NATIVE_AUDIO_MODEL,
  buildLiveTranscriptionConfig
} from '../services/speechConfig';
import { createGeminiClient, isShowcaseMode, resolveClientApiKey } from '../services/geminiClient';

interface StandaloneRecorderProps {
  apiKey?: string;
  settings: Settings;
  onComplete: (transcriptText: string, audioBlob: Blob) => void;
  onCancel: () => void;
}

const StandaloneRecorder: React.FC<StandaloneRecorderProps> = ({
  apiKey,
  settings,
  onComplete,
  onCancel
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [inputLevel, setInputLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderMimeRef = useRef<string>('audio/webm');
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const sessionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<string>('');
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const pcmCaptureRef = useRef<PcmCaptureHandle | null>(null);
  const levelMonitorRef = useRef<InputLevelMonitor | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    levelMonitorRef.current?.stop();
    levelMonitorRef.current = null;
    pcmCaptureRef.current?.stop();
    pcmCaptureRef.current = null;
    void inputAudioContextRef.current?.close().catch(() => undefined);
    inputAudioContextRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
  };

  const startRecording = async () => {
    const normalizedApiKey = resolveClientApiKey(apiKey);
    if (!normalizedApiKey) {
      setError(isShowcaseMode() ? 'SHOWCASE_PROXY_MISSING' : 'MISSING_GEMINI_KEY');
      return;
    }

    try {
      const stream = await getMicrophoneStream({
        audioInputDeviceId: settings.audioInputDeviceId,
        studioMicMode: settings.studioMicMode
      });
      micStreamRef.current = stream;

      levelMonitorRef.current = new InputLevelMonitor();
      levelMonitorRef.current.start(stream, setInputLevel);

      const mimeType = pickRecorderMimeType();
      recorderMimeRef.current = mimeType || 'audio/webm';
      mediaRecorderRef.current = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      if (mediaRecorderRef.current.mimeType) {
        recorderMimeRef.current = mediaRecorderRef.current.mimeType;
      }
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorderRef.current.start(1000);

      const ai = createGeminiClient(apiKey);
      const inputAudioContext = createAudioContext(16000);
      inputAudioContextRef.current = inputAudioContext;
      const transcriptionConfig = buildLiveTranscriptionConfig(settings.language);

      const sessionPromise = ai.live.connect({
        model: LIVE_NATIVE_AUDIO_MODEL,
        callbacks: {
          onopen: () => {
            void startPcmCapture(inputAudioContext, stream, (pcmBlob) => {
              sessionPromise.then((s) => {
                s.sendRealtimeInput({ media: pcmBlob });
              });
            }).then((handle) => {
              pcmCaptureRef.current = handle;
            });
            setIsRecording(true);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              transcriptRef.current += text;
              setTranscript(transcriptRef.current);
            }
          },
          onerror: (e) => {
            console.error('Live Link Error:', e);
            setError('LINK_DROPPED');
          }
        },
        config: {
          responseModalities: [Modality.TEXT],
          inputAudioTranscription: transcriptionConfig,
          systemInstruction:
            'You are a silent transcription engine for a clinical interview. Transcribe the speaker accurately. Do not generate spoken audio or conversational replies; text transcription only.'
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) {
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {
        /* ignore */
      }
      cleanup();
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
      setError('HARDWARE_ERROR');
    }
  };

  const stopRecording = () => {
    setIsProcessing(true);
    levelMonitorRef.current?.stop();
    levelMonitorRef.current = null;
    pcmCaptureRef.current?.stop();
    pcmCaptureRef.current = null;

    const finish = (audioBlob: Blob) => {
      void inputAudioContextRef.current?.close().catch(() => undefined);
      inputAudioContextRef.current = null;
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      if (sessionRef.current) {
        try {
          sessionRef.current.close();
        } catch {
          /* ignore */
        }
        sessionRef.current = null;
      }
      setIsProcessing(false);
      onComplete(transcriptRef.current, audioBlob);
    };

    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === 'inactive') {
      finish(
        new Blob(audioChunksRef.current, {
          type: recorderMimeRef.current || 'audio/webm'
        })
      );
      return;
    }

    rec.onstop = () => {
      const mime = recorderMimeRef.current || rec.mimeType || 'audio/webm';
      finish(new Blob(audioChunksRef.current, { type: mime }));
    };
    try {
      rec.stop();
    } catch {
      finish(
        new Blob(audioChunksRef.current, {
          type: recorderMimeRef.current || 'audio/webm'
        })
      );
    }
  };

  return (
    <div className="flex flex-col h-full bg-white text-black border-t border-black">
      <div className="px-8 py-4 border-b border-black flex justify-between items-center bg-white z-10 font-mono">
        <div className="flex items-center gap-6">
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] flex items-center gap-3">
            <div
              className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-neutral-200'}`}
            />
            Secure_Capture_Link
          </h2>
          {isRecording && (
            <div className="flex items-center gap-4 border-l border-black/10 pl-6">
              <Activity size={12} className="text-red-600 animate-pulse" />
              <span className="text-[8px] font-bold">STREAM_STABLE: 16k_PCM</span>
            </div>
          )}
        </div>
        <div className="flex gap-4">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isProcessing}>
            Discard
          </Button>
          {isRecording && (
            <Button variant="danger" size="sm" onClick={stopRecording} disabled={isProcessing}>
              {isProcessing ? (
                <Loader2 className="animate-spin mr-2" size={12} />
              ) : (
                <Square size={10} className="mr-2" />
              )}
              Finalize
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-neutral-50 overflow-hidden">
        {!isRecording ? (
          <div className="text-center animate-in fade-in duration-500">
            <div className="w-24 h-24 border-2 border-black flex items-center justify-center mx-auto mb-10 rotate-45">
              <Mic size={32} className="-rotate-45 opacity-20" />
            </div>
            <h3 className="text-4xl font-black uppercase tracking-tighter mb-4">
              Initialize_Repository
            </h3>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-4">
              Clinical Audio Acquisition Protocol
            </p>
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-400 max-w-sm mx-auto mb-12 leading-relaxed">
              Select your USB microphone in Settings before capture. Chrome recommended.
            </p>
            <Button size="lg" onClick={() => void startRecording()} className="px-12">
              Begin Capture
            </Button>
          </div>
        ) : (
          <div className="w-full max-w-4xl flex flex-col h-full animate-in slide-in-from-bottom-4 duration-700">
            <div
              ref={scrollRef}
              className="flex-1 bg-white border-2 border-black p-12 overflow-y-auto no-scrollbar shadow-[16px_16px_0px_0px_rgba(0,0,0,0.05)]"
            >
              <div className="flex items-center gap-2 mb-10 opacity-30">
                <Volume2 size={12} />
                <span className="text-[9px] font-black uppercase tracking-[0.4em]">
                  Transcription_Buffer
                </span>
              </div>
              <p className="text-4xl font-bold font-mono tracking-tight leading-tight uppercase">
                {transcript || 'Synchronizing linguistic fragments...'}
                <span className="inline-block w-3 h-8 bg-black ml-1 animate-pulse align-middle" />
              </p>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <span className="text-[9px] font-black uppercase tracking-widest opacity-40">
                Input
              </span>
              <div className="flex-1 h-2 bg-neutral-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-black transition-[width] duration-75"
                  style={{ width: `${Math.round(inputLevel * 100)}%` }}
                />
              </div>
            </div>

            <div className="mt-8 flex justify-between items-center opacity-20">
              <div className="flex items-center gap-4">
                <span className="text-[9px] font-mono font-black uppercase tracking-widest">
                  LOC: [0x7A2F]
                </span>
                <Wifi size={12} />
              </div>
              <span className="text-[9px] font-mono font-black uppercase tracking-widest">
                Protocol_Standard: NEURO_PH_V1
              </span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center p-8">
          <div className="text-center border-2 border-black p-16 shadow-[24px_24px_0px_0px_rgba(0,0,0,1)] max-w-md">
            <AlertTriangle className="mx-auto mb-6 text-red-600" size={48} />
            <p className="text-red-600 text-xl font-black uppercase mb-4">Link_Failure</p>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-12 opacity-50">
              {error}
            </p>
            <Button size="md" className="w-full" onClick={() => window.location.reload()}>
              Re-Initialize_Protocol
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StandaloneRecorder;
