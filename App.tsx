import React, { useState, useEffect, useRef } from 'react';
import { 
  InterviewSession, 
  Settings, 
  LanguagePreference, 
  VoiceGender, 
  InterviewMode, 
  SpeakerSegment 
} from './types';
import { 
  Search, 
  Upload, 
  Mic, 
  Trash2, 
  ChevronRight, 
  ArrowRight, 
  MessageSquare, 
  FileText, 
  Coffee,
  HardDrive,
  Download,
  Sparkles,
  AlertCircle,
  Play
} from 'lucide-react';
import LiveInterviewSession from './components/LiveInterviewSession';
import AnalysisView from './components/AnalysisView';
import SettingsMenu from './components/SettingsMenu';
import StandaloneRecorder from './components/StandaloneRecorder';
import Button from './components/Button';
import { analyzeInterview, transcribeAudio } from './services/geminiService';
import { 
  saveAudioToCache, 
  deleteAudioFromCache, 
  getStorageUsage, 
  formatBytes,
  exportCachedAudio
} from './services/audioCacheService';
import { Artifact } from './constants';

const App: React.FC = () => {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [activeSession, setActiveSession] = useState<InterviewSession | null>(null);
  const [view, setView] = useState<'home' | 'ai-interview' | 'analysis' | 'recorder'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'AI_INTERVIEW' | 'RECORDED' | 'UPLOADED'>('ALL');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatusMessage, setAnalysisStatusMessage] = useState('Mapping Subjective Space');
  const [storageStats, setStorageStats] = useState<{ count: number; totalBytes: number; formattedSize: string }>({
    count: 0,
    totalBytes: 0,
    formattedSize: '0 B',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<Settings>({
    language: LanguagePreference.UK,
    voiceGender: VoiceGender.FEMALE,
    privacyContract: true,
    interviewMode: InterviewMode.BEGINNER,
  });

  useEffect(() => {
    const savedSessions = localStorage.getItem('neuro_phenom_sessions');
    if (savedSessions) {
      try {
        const parsed: InterviewSession[] = JSON.parse(savedSessions);
        // Clean out any stale object URLs from localStorage
        const sanitized = parsed.map(s => ({
          ...s,
          audioUrl: undefined, // Will be rehydrated from IndexedDB on demand
        }));
        setSessions(sanitized);
      } catch (e) {
        console.warn('Could not parse saved sessions:', e);
      }
    }
    const savedSettings = localStorage.getItem('neuro_phenom_settings');
    if (savedSettings) {
      try { setSettings(JSON.parse(savedSettings)); } catch (e) {}
    }

    refreshStorageUsage();
  }, []);

  useEffect(() => {
    // Exclude volatile blob URLs from localStorage serialization
    const storableSessions = sessions.map(({ audioUrl, ...rest }) => rest);
    localStorage.setItem('neuro_phenom_sessions', JSON.stringify(storableSessions));
    refreshStorageUsage();
  }, [sessions]);

  useEffect(() => { 
    localStorage.setItem('neuro_phenom_settings', JSON.stringify(settings)); 
  }, [settings]);

  const refreshStorageUsage = async () => {
    try {
      const stats = await getStorageUsage();
      setStorageStats(stats);
    } catch (e) {}
  };

  const handleCreateAISession = () => setView('ai-interview');
  const handleStartRecording = () => setView('recorder');
  const handleTriggerUpload = () => fileInputRef.current?.click();

  const processTranscriptionResult = async (
    transcriptText: string, 
    type: 'AI_INTERVIEW' | 'RECORDED' | 'UPLOADED', 
    audioBlob?: Blob
  ) => {
    setIsAnalyzing(true);
    setAnalysisStatusMessage('Executing Neurophenomenological Synthesis...');
    const sessionId = crypto.randomUUID();

    try {
      // Step 1: Cache audio in IndexedDB if available
      let hasCachedAudio = false;
      let audioSize = 0;
      let audioMimeType = '';

      if (audioBlob) {
        setAnalysisStatusMessage('Persisting Audio in Local IndexedDB Vault...');
        const cached = await saveAudioToCache(sessionId, audioBlob, 0, { transcript: transcriptText });
        hasCachedAudio = true;
        audioSize = cached.size;
        audioMimeType = cached.mimeType;
      }

      // Step 2: Thematic analysis using gemini-3.8-flash
      setAnalysisStatusMessage('Synthesizing Diachronic & Synchronic Dynamics...');
      const analysis = await analyzeInterview(transcriptText, settings.language);

      const newSession: InterviewSession = {
        id: sessionId,
        date: new Date().toISOString(),
        duration: analysis.transcript?.reduce((max, t) => Math.max(max, t.startTime || 0), 0) || 0,
        type,
        analysis,
        codes: [],
        annotations: [],
        hasCachedAudio,
        audioSize,
        audioMimeType,
      };

      setSessions(prev => [newSession, ...prev]);
      setActiveSession(newSession);
      setView('analysis');
      await refreshStorageUsage();
    } catch (error: any) {
      console.error('Mapping error:', error);
      alert("MAPPING_PROTOCOL_FAILURE: " + (error?.message || "Please check server link."));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|webm|ogg)$/i.test(file.name);

    if (isAudio) {
      setIsAnalyzing(true);
      setAnalysisStatusMessage('Transcribing Uploaded Audio Recording...');
      try {
        const transcript = await transcribeAudio(file, settings.language);
        await processTranscriptionResult(transcript, 'UPLOADED', file);
      } catch (err: any) {
        alert('Failed to transcribe uploaded audio: ' + (err.message || 'Unknown error'));
        setIsAnalyzing(false);
      }
    } else {
      // Text file import
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        if (text) {
          await processTranscriptionResult(text, 'UPLOADED');
        }
      };
      reader.readAsText(file);
    }

    event.target.value = '';
  };

  const handleAIInterviewComplete = async (transcript: SpeakerSegment[], audioBlob?: Blob) => {
    if (transcript.length === 0) { 
      setView('home'); 
      return; 
    }
    const transcriptText = transcript.map(t => `${t.speaker}: ${t.text}`).join('\n');
    await processTranscriptionResult(transcriptText, 'AI_INTERVIEW', audioBlob);
  };

  const handleRecordComplete = async (transcriptText: string, audioBlob: Blob) => {
    await processTranscriptionResult(transcriptText, 'RECORDED', audioBlob);
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("DELETE REPOSITORY? This will remove the transcript and delete its locally cached audio.")) {
      try {
        await deleteAudioFromCache(id);
      } catch (e) {}
      setSessions(prev => prev.filter(s => s.id !== id));
      if (activeSession?.id === id) { 
        setView('home'); 
        setActiveSession(null); 
      }
      await refreshStorageUsage();
    }
  };

  const filteredSessions = sessions.filter(s => {
    const matchesSearch = s.analysis?.summary?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          s.date.includes(searchQuery) ||
                          s.type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'ALL' || s.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const renderHome = () => (
    <div className="flex flex-col gap-0 animate-in fade-in duration-500 max-w-7xl mx-auto w-full p-6 md:p-12 lg:p-20">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept=".txt,.json,audio/*,.mp3,.wav,.m4a,.webm" 
        className="hidden" 
      />
      
      {/* Hero Header */}
      <div className="mb-16">
        <div className="flex items-center gap-6 mb-6">
          <div className="w-16 h-16 bg-black flex items-center justify-center p-3 rounded-2xl shadow-xl">
            <Artifact className="text-white w-full h-full" />
          </div>
          <div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-none">
              NeuroPhenom AI
            </h1>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-400 mt-2">
              Micro-Phenomenological Architecture • v1.4.0
            </p>
          </div>
        </div>
        <p className="text-lg md:text-xl font-medium max-w-3xl tracking-tight leading-relaxed text-neutral-600">
          A high-fidelity clinical interface for mapping pre-reflective subjective experience. 
          Analyze the micro-dynamics of lived moments through diachronic slicing, synchronic categories, and durable local audio caching.
        </p>

        {/* Local Cache Status Pill */}
        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 rounded-full border border-black/10">
            <HardDrive size={13} className="text-emerald-700" />
            <span className="font-bold text-neutral-800">Local Vault Storage:</span>
            <span className="text-neutral-500">{storageStats.count} recordings ({storageStats.formattedSize})</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Zero-Cloud Audio Persistence Protocol
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left Column: Action Launchers */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Live Conversational Voice Launcher */}
          <div className="bg-black text-white p-8 md:p-10 flex flex-col justify-between min-h-[320px] rounded-[32px] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-white/10 transition-colors" />
            <div className="w-14 h-14 border border-white/20 flex items-center justify-center rounded-2xl bg-white/10">
              <MessageSquare size={26} className="text-white" />
            </div>
            <div className="relative z-10 mt-6">
              <h3 className="text-3xl font-black uppercase tracking-tight mb-2">Conduct AI Interview</h3>
              <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-8">
                Low-Latency Voice Elicitation • {settings.language} • {settings.voiceGender}
              </p>
              <Button 
                onClick={handleCreateAISession} 
                variant="secondary" 
                size="lg" 
                className="w-fit rounded-full px-8 hover:scale-105 active:scale-95 transition-transform"
              >
                Launch Voice Session <ChevronRight size={18} className="ml-2" />
              </Button>
            </div>
          </div>

          {/* Secondary Actions */}
          <div className="grid grid-cols-2 gap-4">
            <div 
              onClick={handleStartRecording}
              className="border-2 border-black p-6 md:p-8 flex flex-col justify-between group hover:bg-neutral-50 transition-all cursor-pointer rounded-[24px]"
            >
              <div className="w-12 h-12 border-2 border-black/10 flex items-center justify-center rounded-xl group-hover:border-black/30 transition-colors">
                <Mic size={22} className="text-black" />
              </div>
              <div className="mt-6">
                <h4 className="text-xs font-black uppercase tracking-widest mb-1">Live Capture</h4>
                <p className="text-[10px] font-bold uppercase tracking-widest flex items-center text-neutral-400 group-hover:text-black transition-colors">
                  Record & Cache <ChevronRight size={12} className="ml-1" />
                </p>
              </div>
            </div>

            <div 
              onClick={handleTriggerUpload}
              className="border-2 border-black p-6 md:p-8 flex flex-col justify-between group hover:bg-neutral-50 transition-all cursor-pointer rounded-[24px]"
            >
              <div className="w-12 h-12 border-2 border-black/10 flex items-center justify-center rounded-xl group-hover:border-black/30 transition-colors">
                <FileText size={22} className="text-black" />
              </div>
              <div className="mt-6">
                <h4 className="text-xs font-black uppercase tracking-widest mb-1">Batch Import</h4>
                <p className="text-[10px] font-bold uppercase tracking-widest flex items-center text-neutral-400 group-hover:text-black transition-colors">
                  Audio or Text <Upload size={12} className="ml-1" />
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Repository of Sessions */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b-2 border-black pb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-black uppercase tracking-tight">Repository</h2>
              <span className="bg-black text-white text-[10px] font-black px-3 py-1 rounded-full">{filteredSessions.length}</span>
            </div>
            <div className="flex items-center border-2 border-black px-4 py-2 w-full md:w-72 bg-neutral-50 rounded-full focus-within:bg-white transition-colors">
              <Search size={16} className="mr-3 opacity-30" />
              <input 
                type="text" 
                placeholder="SEARCH ARCHIVE..." 
                className="bg-transparent outline-none uppercase text-[10px] font-black tracking-widest w-full placeholder:text-neutral-300"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {filteredSessions.length === 0 ? (
            <div className="py-24 text-center border-2 border-dashed border-black/10 bg-neutral-50/50 rounded-[32px] p-8">
              <p className="text-xs font-black uppercase tracking-[0.4em] text-neutral-400 mb-2">No Protocols Archived</p>
              <p className="text-xs text-neutral-500 mb-6">Initialize an AI voice interview or capture audio to begin mapping.</p>
              <Button size="sm" onClick={handleCreateAISession}>
                Start First Protocol
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 overflow-y-auto max-h-[640px] pr-2 no-scrollbar">
              {filteredSessions.map(session => (
                <div 
                  key={session.id}
                  onClick={() => { setActiveSession(session); setView('analysis'); }}
                  className="group border-2 border-black p-6 md:p-8 hover:bg-black hover:text-white transition-all cursor-pointer rounded-[24px] flex flex-col gap-4 relative"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg border border-current flex items-center justify-center opacity-30">
                        <FileText size={14} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-50 group-hover:opacity-75">
                        {new Date(session.date).toLocaleDateString()} • {session.type.replace('_', ' ')}
                      </span>
                    </div>

                    <button 
                      onClick={(e) => deleteSession(session.id, e)} 
                      className="opacity-0 group-hover:opacity-100 p-2 hover:bg-white/20 rounded-lg transition-all"
                      title="Delete protocol from repository"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <h3 className="text-xl md:text-2xl font-bold uppercase tracking-tight leading-snug line-clamp-2 max-w-[85%]">
                    {session.analysis?.summary || "Protocol Analysis Registered"}
                  </h3>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] font-black uppercase border border-current px-2.5 py-0.5 rounded-full opacity-60">
                      {session.analysis?.phasesCount || 0} Phases
                    </span>
                    {session.analysis?.modalities?.slice(0, 3).map((m, i) => (
                      <span key={i} className="text-[9px] font-black uppercase border border-current px-2.5 py-0.5 rounded-full opacity-60">
                        {m}
                      </span>
                    ))}
                    {session.hasCachedAudio && (
                      <span className="text-[9px] font-mono font-bold bg-neutral-200 group-hover:bg-neutral-800 text-neutral-800 group-hover:text-neutral-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <HardDrive size={10} />
                        CACHED {session.audioSize ? `(${formatBytes(session.audioSize)})` : ''}
                      </span>
                    )}
                  </div>

                  <ArrowRight size={18} className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-28 p-12 border-t-2 border-black flex flex-col items-center gap-6">
        <a 
          href="https://newpsychonaut.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs font-black uppercase tracking-[0.6em] hover:opacity-50 transition-opacity"
        >
          NewPsychonaut.com
        </a>
        <div className="flex items-center gap-8 opacity-20">
          <Artifact className="h-8 w-8 text-black" />
          <div className="w-12 h-[2px] bg-black" />
          <Artifact className="h-8 w-8 text-black transform rotate-180" />
        </div>
      </footer>
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-black flex flex-col font-sans selection:bg-black selection:text-white">
      {/* Navigation Header */}
      <header className="h-20 border-b-2 border-black px-6 md:px-10 flex items-center justify-between sticky top-0 z-50 bg-white/95 backdrop-blur-md">
        <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setView('home')}>
          <div className="w-10 h-10 bg-black flex items-center justify-center p-2 rounded-xl group-hover:scale-105 transition-transform shadow-md">
            <Artifact className="w-full h-full text-white" />
          </div>
          <div>
            <span className="text-xl md:text-2xl font-black tracking-tighter uppercase">NeuroPhenom AI</span>
            <span className="hidden sm:inline-block ml-3 text-[9px] font-mono font-bold text-neutral-400 uppercase tracking-widest">
              Subjective Mapping
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <SettingsMenu settings={settings} onUpdate={setSettings} />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col">
        {isAnalyzing && (
          <div className="fixed inset-0 bg-white/80 backdrop-blur-md z-[100] flex items-center justify-center p-6">
            <div className="text-center p-10 bg-white border-2 border-black rounded-3xl shadow-2xl max-w-sm">
              <div className="w-16 h-16 border-4 border-black border-t-transparent animate-spin mx-auto mb-6 rounded-full" />
              <h3 className="text-xs font-black uppercase tracking-[0.4em] mb-2">Protocol In Progress</h3>
              <p className="text-xs font-mono font-bold text-neutral-500 uppercase">{analysisStatusMessage}</p>
            </div>
          </div>
        )}

        <div className="flex-1">
          {view === 'home' && renderHome()}
          {view === 'recorder' && (
            <StandaloneRecorder 
              language={settings.language}
              onComplete={handleRecordComplete} 
              onCancel={() => setView('home')} 
            />
          )}
          {view === 'ai-interview' && (
            <div className="p-0 h-[calc(100vh-80px)]">
              <LiveInterviewSession 
                settings={settings} 
                onComplete={handleAIInterviewComplete}
                onCancel={() => setView('home')} 
              />
            </div>
          )}
          {view === 'analysis' && activeSession && (
            <div className="p-0 h-[calc(100vh-80px)] flex flex-col animate-in slide-in-from-bottom-6 duration-500">
              <AnalysisView 
                session={activeSession} 
                onUpdate={(updated) => {
                  setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
                  setActiveSession(updated);
                }} 
              />
            </div>
          )}
        </div>
      </main>

      {/* Floating Coffee Support */}
      {view === 'home' && (
        <div className="fixed bottom-8 right-8 z-50">
          <a 
            href="https://buymeacoffee.com/stevebeale" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-14 h-14 bg-black text-white flex items-center justify-center rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl group"
            title="Buy me a coffee"
          >
            <Coffee size={22} className="group-hover:rotate-12 transition-transform" />
          </a>
        </div>
      )}
    </div>
  );
};

export default App;
