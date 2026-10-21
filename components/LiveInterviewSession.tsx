import React, { useState, useEffect, useRef } from 'react';
import { Settings, LanguagePreference, VoiceGender, SpeakerSegment } from '../types';
import Button from './Button';
import { PhoneOff, Terminal, Bot, AudioLines, Activity, Globe, Volume2, Sparkles, AlertCircle } from 'lucide-react';

interface LiveInterviewSessionProps {
  settings: Settings;
  onComplete: (transcript: SpeakerSegment[], audioBlob?: Blob) => void;
  onCancel: () => void;
}

const LiveInterviewSession: React.FC<LiveInterviewSessionProps> = ({ settings, onComplete, onCancel }) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<{ speaker: 'AI' | 'Interviewee'; text: string; id: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedAudioChunksRef = useRef<Blob[]>([]);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const transcriptHistoryRef = useRef<SpeakerSegment[]>([]);
  const currentTurnRef = useRef<{ speaker: 'AI' | 'Interviewee' | null; text: string; id: string | null }>({
    speaker: null,
    text: '',
    id: null,
  });

  const nextStartTimeRef = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionStartTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveTranscript]);

  useEffect(() => {
    return () => {
      cleanupSession();
    };
  }, []);

  const cleanupSession = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    // Stop all active playing audio nodes
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current = [];

    if (wsRef.current) {
      try { wsRef.current.close(); } catch (e) {}
      wsRef.current = null;
    }
    if (inputAudioContextRef.current) {
      try { inputAudioContextRef.current.close(); } catch (e) {}
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      try { outputAudioContextRef.current.close(); } catch (e) {}
      outputAudioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const encode = (bytes: Uint8Array): string => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const decode = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  // Convert Float32 microphone data to 16-bit PCM (16kHz)
  const floatTo16BitPCM = (input: Float32Array): string => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return encode(new Uint8Array(output.buffer));
  };

  // Decode raw 16-bit PCM little-endian (24kHz) from Gemini Live to AudioBuffer
  const decode24kHzPCM = (data: Uint8Array, ctx: AudioContext): AudioBuffer => {
    const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
    const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < dataInt16.length; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
  };

  const startSession = async () => {
    setError(null);
    setIsConnecting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      mediaStreamRef.current = stream;

      // Start local audio recording to cache interview conversation
      recordedAudioChunksRef.current = [];
      try {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

        const recorder = new MediaRecorder(stream, { mimeType });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedAudioChunksRef.current.push(e.data);
        };
        recorder.start(1000);
        mediaRecorderRef.current = recorder;
      } catch (recErr) {
        console.warn('Could not initialize local audio recorder on stream:', recErr);
      }

      // Input Audio Context (16kHz for Gemini Live)
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputAudioContextRef.current = inputCtx;

      // Output Audio Context (24kHz for model audio playback)
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      outputAudioContextRef.current = outputCtx;
      nextStartTimeRef.current = 0;
      sessionStartTimeRef.current = Date.now();

      // Audio level analyser for waveform visualizer
      const analyser = inputCtx.createAnalyser();
      analyser.fftSize = 64;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setAudioLevel(avg);
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      // Establish WebSocket link to backend server
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/live`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Live link connected, initializing session params');
        ws.send(JSON.stringify({
          type: 'init',
          language: settings.language,
          voiceGender: settings.voiceGender,
          interviewMode: settings.interviewMode,
          privacyContract: settings.privacyContract,
        }));
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'ready') {
            setIsConnecting(false);
            setIsActive(true);

            // Connect microphone stream through processor
            const source = inputCtx.createMediaStreamSource(stream);
            source.connect(analyser);

            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              if (ws.readyState === WebSocket.OPEN) {
                const channelData = e.inputBuffer.getChannelData(0);
                const pcmBase64 = floatTo16BitPCM(channelData);
                ws.send(JSON.stringify({
                  type: 'audio',
                  audio: pcmBase64,
                }));
              }
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          } else if (msg.type === 'audio' && msg.audio && outputAudioContextRef.current) {
            const outCtx = outputAudioContextRef.current;
            if (outCtx.state === 'suspended') {
              await outCtx.resume();
            }

            const pcmBytes = decode(msg.audio);
            const audioBuffer = decode24kHzPCM(pcmBytes, outCtx);

            const bufferSource = outCtx.createBufferSource();
            bufferSource.buffer = audioBuffer;
            bufferSource.connect(outCtx.destination);

            // Precise scheduling for gapless playback
            const currentTime = outCtx.currentTime;
            if (nextStartTimeRef.current < currentTime) {
              nextStartTimeRef.current = currentTime + 0.02; // Small initial buffer
            }

            bufferSource.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;

            activeSourcesRef.current.push(bufferSource);
            bufferSource.onended = () => {
              activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== bufferSource);
            };
          } else if (msg.type === 'interrupted') {
            // User began speaking: cut off model audio immediately
            activeSourcesRef.current.forEach(source => {
              try { source.stop(); } catch (e) {}
            });
            activeSourcesRef.current = [];
            if (outputAudioContextRef.current) {
              nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
            }
          } else if (msg.type === 'transcription' && msg.text) {
            updateIncrementalTranscript(msg.speaker || 'AI', msg.text);
          } else if (msg.type === 'turnComplete') {
            finalizeTurn();
          } else if (msg.type === 'error') {
            setError(msg.error || 'Live communication interrupted');
          }
        } catch (e) {
          console.error('Error handling WebSocket message:', e);
        }
      };

      ws.onerror = (e) => {
        console.error('Live WebSocket error:', e);
        setError('Synchronous Link Disconnected');
        setIsConnecting(false);
      };

      ws.onclose = () => {
        setIsActive(false);
        setIsConnecting(false);
      };

    } catch (err: any) {
      console.error('Audio initialization error:', err);
      setError(err?.message || 'Microphone Hardware Error');
      setIsConnecting(false);
    }
  };

  const updateIncrementalTranscript = (speaker: 'AI' | 'Interviewee', text: string) => {
    if (currentTurnRef.current.speaker !== speaker) {
      if (currentTurnRef.current.speaker !== null) finalizeTurn();
      currentTurnRef.current = { speaker, text, id: crypto.randomUUID() };
    } else {
      currentTurnRef.current.text += text;
    }

    setLiveTranscript(prev => {
      const others = prev.filter(m => m.id !== currentTurnRef.current.id);
      return [...others, { ...currentTurnRef.current } as any];
    });
  };

  const finalizeTurn = () => {
    if (!currentTurnRef.current.text || !currentTurnRef.current.speaker) return;
    const ts = (Date.now() - sessionStartTimeRef.current) / 1000;
    transcriptHistoryRef.current.push({
      speaker: currentTurnRef.current.speaker === 'AI' ? 'AI' : 'Interviewee',
      text: currentTurnRef.current.text.trim(),
      startTime: ts,
    });
    currentTurnRef.current = { speaker: null, text: '', id: null };
  };

  const endSession = () => {
    finalizeTurn();

    // Finalize audio recording if available
    let audioBlob: Blob | undefined = undefined;
    if (mediaRecorderRef.current && recordedAudioChunksRef.current.length > 0) {
      try {
        audioBlob = new Blob(recordedAudioChunksRef.current, {
          type: mediaRecorderRef.current.mimeType || 'audio/webm',
        });
      } catch (e) {
        console.warn('Could not package recorded audio chunks:', e);
      }
    }

    cleanupSession();
    onComplete(transcriptHistoryRef.current, audioBlob);
  };

  return (
    <div className="flex flex-col h-full bg-white text-black border-t-2 border-black">
      {/* Session Top Status Bar */}
      <div className="px-8 py-4 border-b-2 border-black flex justify-between items-center bg-white z-10">
        <div className="flex items-center gap-6">
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full transition-all ${
              isActive 
                ? 'bg-black animate-pulse shadow-[0_0_10px_rgba(0,0,0,0.5)]' 
                : isConnecting 
                ? 'bg-amber-500 animate-bounce' 
                : 'bg-neutral-300'
            }`} />
            Live Voice Protocol
          </h2>
          {isActive && (
            <div className="flex items-center gap-3 px-4 py-1.5 bg-neutral-100 border border-black/10 rounded-full">
              <Activity size={12} className="text-black animate-pulse" />
              <span className="text-[9px] font-mono font-bold tracking-tight">GEMINI_3.8_LIVE • 24k_SYNC</span>
            </div>
          )}
          <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
            {settings.language} • {settings.voiceGender} • {settings.interviewMode}
          </span>
        </div>

        <div className="flex gap-4 items-center">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Exit
          </Button>
          {isActive && (
            <Button size="sm" onClick={endSession} className="bg-black text-white hover:bg-neutral-800">
              Finalize & Synthesize
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col relative overflow-hidden bg-[#fafafa]">
        {/* Unconnected Welcome State */}
        {!isActive && !error && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-700">
            <div className="relative mb-12">
              <div className="w-24 h-24 border-2 border-black flex items-center justify-center rounded-3xl bg-white shadow-xl">
                <AudioLines size={48} className="text-black" />
              </div>
            </div>
            <h3 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-4 leading-tight">
              Micro-Phenomenology Elicitation
            </h3>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-neutral-500 max-w-md mb-10 leading-relaxed">
              Bi-directional voice conversation with low-latency conversational audio. 
              The interviewer will guide you to explore the sensory micro-dynamics of a singular moment.
            </p>
            <Button 
              size="lg" 
              onClick={startSession} 
              loading={isConnecting}
              className="px-12 py-5 rounded-full text-xs font-black shadow-2xl hover:scale-105 active:scale-95 transition-all"
            >
              {isConnecting ? "Establishing Live Neural Link..." : "Initialize Conversational Session"}
            </Button>
          </div>
        )}

        {/* Active Conversation Live Transcript */}
        {isActive && (
          <div className="flex-1 flex flex-col p-6 md:p-12 lg:p-16 overflow-hidden">
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-10 pr-4 scroll-smooth no-scrollbar">
              {liveTranscript.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                  <Sparkles size={32} className="mb-4 animate-spin" />
                  <p className="text-xs font-black uppercase tracking-[0.4em]">
                    Awaiting opening clinical question...
                  </p>
                  <p className="text-[10px] font-mono mt-2">Speak into microphone to respond naturally</p>
                </div>
              ) : (
                liveTranscript.map((msg, idx) => (
                  <div 
                    key={msg.id} 
                    className={`flex flex-col max-w-2xl animate-in slide-in-from-bottom-2 duration-300 ${
                      msg.speaker === 'AI' ? 'mr-auto' : 'ml-auto items-end'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2 opacity-40">
                      <span className="text-[9px] font-black uppercase tracking-widest">{msg.speaker}</span>
                      <div className="w-6 h-px bg-black" />
                    </div>
                    <div className={`p-6 md:p-8 border-2 rounded-2xl ${
                      msg.speaker === 'AI' 
                        ? 'bg-white border-black text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,0.06)]' 
                        : 'bg-black text-white border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,0.12)]'
                    }`}>
                      <p className="text-xl md:text-2xl font-bold leading-snug tracking-tight font-mono">
                        {msg.text}
                        {idx === liveTranscript.length - 1 && (
                          <span className="inline-block w-2.5 h-5 bg-current ml-1.5 animate-pulse" />
                        )}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Dynamic Waveform Visualizer */}
            <div className="mt-8 pt-4 border-t border-black/10 flex items-center justify-between px-6 bg-white rounded-2xl py-3 border border-black shadow-sm">
              <div className="flex items-center gap-3">
                <Volume2 size={16} className="text-black" />
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Live Audio Stream</span>
              </div>
              <div className="flex items-end gap-1 h-6">
                {[...Array(32)].map((_, i) => {
                  const normalized = Math.min(100, Math.max(15, (audioLevel * (1 + (i % 5) * 0.2))));
                  return (
                    <div 
                      key={i} 
                      className="w-1 bg-black rounded-full transition-all duration-75"
                      style={{ 
                        height: `${normalized}%`,
                        opacity: 0.2 + (audioLevel / 255) * 0.8
                      }} 
                    />
                  );
                })}
              </div>
              <div className="text-[9px] font-mono font-black uppercase tracking-widest opacity-60">
                Audio Buffered In Local Storage
              </div>
            </div>
          </div>
        )}

        {/* Error Modal */}
        {error && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center p-12 border-2 border-black bg-white shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] max-w-md rounded-2xl">
              <AlertCircle size={40} className="mx-auto mb-4 text-red-600" />
              <p className="text-xs font-black uppercase tracking-widest mb-2 text-red-600">Protocol Disconnect</p>
              <p className="text-sm font-medium text-neutral-600 mb-8">{error}</p>
              <div className="flex gap-4 justify-center">
                <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
                <Button size="sm" onClick={startSession}>Reconnect</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveInterviewSession;
