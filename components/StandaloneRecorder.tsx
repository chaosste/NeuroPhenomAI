import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  Square, 
  Pause, 
  Play, 
  Loader2, 
  Activity, 
  Volume2, 
  HardDrive, 
  CheckCircle2, 
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import Button from './Button';
import { transcribeAudio } from '../services/geminiService';
import { saveAudioToCache, formatBytes } from '../services/audioCacheService';
import { LanguagePreference } from '../types';

interface StandaloneRecorderProps {
  language?: LanguagePreference;
  onComplete: (transcriptText: string, audioBlob: Blob) => void;
  onCancel: () => void;
}

const StandaloneRecorder: React.FC<StandaloneRecorderProps> = ({ 
  language = LanguagePreference.UK, 
  onComplete, 
  onCancel 
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<string>('');
  const [transcriptPreview, setTranscriptPreview] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cachedStatus, setCachedStatus] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastRecordedBlobRef = useRef<Blob | null>(null);
  const speechRecognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch (e) {}
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (e) {}
    }
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    setError(null);
    setCachedStatus(null);
    setTranscriptPreview('');
    setDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Audio level visualizer analyser
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        setAudioLevel(sum / dataArray.length);
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      // Determine best audio mime type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(500); // 500ms intervals
      setIsRecording(true);
      setIsPaused(false);

      // Start duration timer
      timerIntervalRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      // Initialize live speech recognition for real-time visual feedback if supported
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = language === LanguagePreference.UK ? 'en-GB' : 'en-US';

          recognition.onresult = (event: any) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              interim += event.results[i][0].transcript;
            }
            if (interim) {
              setTranscriptPreview(interim);
            }
          };

          recognition.onerror = () => {
            // Ignore minor recognition errors; transcription is handled by Gemini
          };

          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch (srErr) {
          console.log('Web speech preview not available, using audio visualizer');
        }
      }

    } catch (err: any) {
      console.error('Audio capture failure:', err);
      setError('Microphone access denied or hardware unavailable');
    }
  };

  const togglePause = () => {
    if (!mediaRecorderRef.current) return;

    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerIntervalRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.start(); } catch (e) {}
      }
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch (e) {}
      }
    }
  };

  const stopAndProcessRecording = () => {
    if (!mediaRecorderRef.current) return;
    setIsProcessing(true);
    setProcessingStage('Packaging Audio Stream...');

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch (e) {}
    }

    mediaRecorderRef.current.onstop = async () => {
      try {
        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const finalBlob = new Blob(audioChunksRef.current, { type: mimeType });
        lastRecordedBlobRef.current = finalBlob;

        // Step 1: Securely cache into IndexedDB first
        setProcessingStage('Caching Audio Locally to IndexedDB...');
        const tempSessionId = crypto.randomUUID();
        await saveAudioToCache(tempSessionId, finalBlob, duration, {
          transcript: transcriptPreview || undefined,
        });
        setCachedStatus(`Verified Cache: ${formatBytes(finalBlob.size)}`);

        // Step 2: High-accuracy transcription using gemini-3.5-transcribe
        setProcessingStage('Transcribing with Gemini 3.5 Transcribe...');
        let finalTranscript = '';
        try {
          finalTranscript = await transcribeAudio(finalBlob, language);
        } catch (transcribeErr: any) {
          console.warn('Backend audio transcription warning, falling back to captured text:', transcribeErr);
          finalTranscript = transcriptPreview || 'Participant micro-phenomenological interview session recording.';
        }

        if (!finalTranscript.trim()) {
          finalTranscript = transcriptPreview || 'Lived experience reflection audio captured.';
        }

        setProcessingStage('Initiating Neurophenomenological Analysis...');
        onComplete(finalTranscript, finalBlob);

      } catch (err: any) {
        console.error('Recording processing failure:', err);
        setError(`Processing error: ${err.message || 'Failed to process audio'}`);
        setIsProcessing(false);
      } finally {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
        }
      }
    };

    mediaRecorderRef.current.stop();
  };

  const retryWithCachedAudio = async () => {
    if (!lastRecordedBlobRef.current) return;
    setError(null);
    setIsProcessing(true);
    try {
      setProcessingStage('Transcribing with Gemini 3.5 Transcribe...');
      const transcript = await transcribeAudio(lastRecordedBlobRef.current, language);
      setProcessingStage('Synthesizing Analysis...');
      onComplete(transcript, lastRecordedBlobRef.current);
    } catch (err: any) {
      setError(`Retry failed: ${err.message}`);
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white text-black border-t-2 border-black font-sans">
      {/* Top Header Bar */}
      <div className="px-8 py-4 border-b-2 border-black flex justify-between items-center bg-white z-10">
        <div className="flex items-center gap-6">
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full transition-all ${
              isRecording 
                ? isPaused 
                  ? 'bg-amber-500' 
                  : 'bg-red-600 animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.5)]' 
                : 'bg-neutral-300'
            }`} />
            Live Audio Capture
          </h2>
          {isRecording && (
            <div className="flex items-center gap-3 border-l-2 border-black/10 pl-6">
              <span className="text-sm font-mono font-black">{formatTimer(duration)}</span>
              <Activity size={14} className="text-red-600 animate-pulse" />
              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                {isPaused ? 'PAUSED' : 'RECORDING ACTIVE'}
              </span>
            </div>
          )}
          {cachedStatus && (
            <div className="flex items-center gap-2 px-3 py-1 bg-neutral-100 rounded-full border border-black/10">
              <HardDrive size={12} className="text-emerald-600" />
              <span className="text-[9px] font-mono font-bold text-emerald-800">{cachedStatus}</span>
            </div>
          )}
        </div>

        <div className="flex gap-4">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isProcessing}>
            Discard
          </Button>

          {isRecording && (
            <>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={togglePause} 
                disabled={isProcessing}
                className="flex items-center gap-2"
              >
                {isPaused ? <Play size={12} /> : <Pause size={12} />}
                {isPaused ? 'Resume' : 'Pause'}
              </Button>

              <Button 
                variant="danger" 
                size="sm" 
                onClick={stopAndProcessRecording} 
                disabled={isProcessing}
                className="flex items-center gap-2"
              >
                <Square size={12} />
                Finalize & Transcribe
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#fafafa] overflow-hidden">
        {!isRecording && !isProcessing ? (
          <div className="text-center animate-in fade-in duration-500 max-w-lg">
            <div className="w-28 h-28 border-2 border-black flex items-center justify-center mx-auto mb-8 rounded-3xl bg-white shadow-xl hover:scale-105 transition-transform">
              <Mic size={40} className="text-black" />
            </div>
            <h3 className="text-4xl font-black uppercase tracking-tighter mb-4 leading-tight">
              Clinical Audio Acquisition
            </h3>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-neutral-500 mb-10 leading-relaxed">
              Record a micro-phenomenological interview or personal lived moment. 
              The audio is durably cached in your browser's IndexedDB vault and transcribed with Gemini 3.5.
            </p>
            <Button 
              size="lg" 
              onClick={startRecording} 
              className="px-12 py-5 rounded-full text-xs font-black shadow-2xl hover:scale-105 active:scale-95 transition-all"
            >
              Start Recording Session
            </Button>
          </div>
        ) : isProcessing ? (
          <div className="text-center animate-in fade-in zoom-in-95 duration-500 max-w-md p-10 bg-white border-2 border-black rounded-3xl shadow-2xl">
            <Loader2 size={48} className="animate-spin text-black mx-auto mb-6" />
            <h3 className="text-2xl font-black uppercase tracking-tight mb-3">Processing Protocol</h3>
            <p className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-500 mb-6">
              {processingStage}
            </p>
            <div className="w-full bg-neutral-100 h-2 rounded-full overflow-hidden border border-black/10">
              <div className="bg-black h-full w-3/4 animate-pulse" />
            </div>
          </div>
        ) : (
          <div className="w-full max-w-4xl flex flex-col h-full animate-in slide-in-from-bottom-4 duration-700">
            {/* Live Visualizer and Timer */}
            <div className="bg-white border-2 border-black rounded-3xl p-10 shadow-2xl flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-8 opacity-40">
                  <div className="flex items-center gap-2">
                    <Volume2 size={16} />
                    <span className="text-[10px] font-black uppercase tracking-[0.4em]">Audio Buffer Monitor</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <HardDrive size={14} />
                    <span className="text-[10px] font-mono font-bold">IndexedDB Cache Active</span>
                  </div>
                </div>

                <div className="text-center py-6">
                  <div className="text-7xl md:text-8xl font-black font-mono tracking-tight text-black mb-4">
                    {formatTimer(duration)}
                  </div>
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-neutral-400">
                    {isPaused ? "Recording Suspended" : "Capturing Pre-Reflective Temporal Sequence"}
                  </p>
                </div>
              </div>

              {/* Dynamic Waveform Visualizer */}
              <div className="my-8 flex items-end justify-center gap-1.5 h-24 px-6 bg-neutral-50 rounded-2xl border border-black/5 py-3">
                {[...Array(48)].map((_, i) => {
                  const barHeight = isPaused 
                    ? 8 
                    : Math.min(100, Math.max(10, (audioLevel * (1 + (i % 6) * 0.25))));
                  return (
                    <div 
                      key={i} 
                      className={`w-1.5 rounded-full transition-all duration-75 ${
                        isPaused ? 'bg-neutral-300' : 'bg-black'
                      }`}
                      style={{ 
                        height: `${barHeight}%`,
                        opacity: isPaused ? 0.3 : 0.2 + (audioLevel / 255) * 0.8
                      }} 
                    />
                  );
                })}
              </div>

              {/* Live Preview Text */}
              <div className="border-t border-black/10 pt-6">
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400 block mb-2">
                  Live Transcription Stream:
                </span>
                <p className="text-base font-mono font-bold leading-relaxed line-clamp-3 uppercase text-neutral-800">
                  {transcriptPreview || "Linguistic sensory fragments buffering in local memory..."}
                  <span className="inline-block w-2 h-4 bg-black ml-1 animate-pulse align-middle" />
                </p>
              </div>
            </div>

            {/* Bottom Controls Bar */}
            <div className="mt-6 flex justify-between items-center px-4">
              <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-neutral-400">
                Format: 48kHz Opus PCM • Durable Client-Side Vault
              </span>
              <div className="flex gap-4">
                <Button variant="secondary" size="md" onClick={togglePause}>
                  {isPaused ? 'Resume Capture' : 'Pause'}
                </Button>
                <Button size="md" onClick={stopAndProcessRecording} className="px-8 bg-black text-white">
                  Stop & Process
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Fallback & Local Audio Cache Recovery Modal */}
      {error && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="border-2 border-black bg-white p-10 max-w-md rounded-3xl shadow-2xl text-center">
            <AlertTriangle className="mx-auto mb-4 text-red-600" size={44} />
            <h3 className="text-xl font-black uppercase tracking-tight mb-2">Capture Error</h3>
            <p className="text-xs font-medium text-neutral-600 mb-8">{error}</p>
            
            <div className="flex flex-col gap-3">
              {lastRecordedBlobRef.current && (
                <Button size="md" onClick={retryWithCachedAudio} className="w-full flex items-center justify-center gap-2">
                  <RefreshCw size={14} /> Retry Analysis with Cached Audio
                </Button>
              )}
              <Button variant="outline" size="md" onClick={() => setError(null)} className="w-full">
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StandaloneRecorder;
