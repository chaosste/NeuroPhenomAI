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
  Coffee
} from 'lucide-react';
import LiveInterviewSession from './components/LiveInterviewSession';
import AnalysisView from './components/AnalysisView';
import SettingsMenu from './components/SettingsMenu';
import StandaloneRecorder from './components/StandaloneRecorder';
import AppFallback from './components/AppFallback';
import Button from './components/Button';
import { analyzeInterview } from './services/geminiService';
import { Artifact } from './constants';

const App: React.FC = () => {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [activeSession, setActiveSession] = useState<InterviewSession | null>(null);
  const [view, setView] = useState<'home' | 'ai-interview' | 'analysis' | 'recorder'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'AI_INTERVIEW' | 'RECORDED' | 'UPLOADED'>('ALL');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [offlineAcknowledged, setOfflineAcknowledged] = useState(false);
  const [appNotice, setAppNotice] = useState<{ type: 'analysis-error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<Settings>({
    language: LanguagePreference.UK,
    voiceGender: VoiceGender.FEMALE,
    privacyContract: true,
    increasedSensitivityMode: false,
    interviewMode: InterviewMode.BEGINNER,
    persistLocalData: false
  });

  const encodeBase64 = (bytes: Uint8Array) => {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const decodeBase64 = (value: string) => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  };

  const deriveArchiveKey = async (passphrase: string, salt: Uint8Array, iterations: number) => {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as unknown as BufferSource,
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  };

  const encryptArchive = async (payload: object, passphrase: string) => {
    const iterations = 250000;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveArchiveKey(passphrase, salt, iterations);
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        key,
        plaintext
      )
    );

    return JSON.stringify({
      v: 1,
      alg: 'AES-GCM',
      kdf: 'PBKDF2-SHA256',
      iter: iterations,
      salt: encodeBase64(salt),
      iv: encodeBase64(iv),
      data: encodeBase64(ciphertext)
    });
  };

  const decryptArchive = async (payloadText: string, passphrase: string) => {
    const parsed = JSON.parse(payloadText);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      parsed.v !== 1 ||
      typeof parsed.iter !== 'number' ||
      typeof parsed.salt !== 'string' ||
      typeof parsed.iv !== 'string' ||
      typeof parsed.data !== 'string'
    ) {
      throw new Error('Invalid archive format.');
    }

    const salt = decodeBase64(parsed.salt);
    const iv = decodeBase64(parsed.iv);
    const ciphertext = decodeBase64(parsed.data);
    const key = await deriveArchiveKey(passphrase, salt, parsed.iter);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );

    return JSON.parse(new TextDecoder().decode(plaintext));
  };

  useEffect(() => {
    const savedSettings = localStorage.getItem('neuro_phenom_settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({ ...prev, ...parsed }));
        if (parsed?.persistLocalData) {
          const savedSessions = localStorage.getItem('neuro_phenom_sessions');
          if (savedSessions) {
            try { setSessions(JSON.parse(savedSessions)); } catch {}
          }
        }
      } catch {}
    }
    const sessionApiKey = sessionStorage.getItem('neuro_phenom_api_key');
    if (sessionApiKey) {
      setSettings(prev => ({ ...prev, apiKey: sessionApiKey }));
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setOfflineAcknowledged(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setOfflineAcknowledged(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (settings.persistLocalData) {
      localStorage.setItem('neuro_phenom_sessions', JSON.stringify(sessions));
      return;
    }
    localStorage.removeItem('neuro_phenom_sessions');
  }, [sessions, settings.persistLocalData]);

  useEffect(() => {
    const { apiKey: _omitApiKey, ...safeSettings } = settings;
    localStorage.setItem('neuro_phenom_settings', JSON.stringify(safeSettings));
  }, [settings]);

  useEffect(() => {
    if (settings.apiKey && settings.apiKey.trim().length > 0) {
      sessionStorage.setItem('neuro_phenom_api_key', settings.apiKey);
      return;
    }
    sessionStorage.removeItem('neuro_phenom_api_key');
  }, [settings.apiKey]);

  const handleExportEncryptedArchive = async () => {
    if (sessions.length === 0) {
      alert('No sessions available to export.');
      return;
    }
    const passphrase = window.prompt('Set archive passphrase (required to decrypt):');
    if (!passphrase) return;

    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        sessions
      };
      const encrypted = await encryptArchive(payload, passphrase);
      const blob = new Blob([encrypted], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `neurophenom-archive-${new Date().toISOString().slice(0, 10)}.npvault.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Archive export failed.');
    }
  };

  const handleImportEncryptedArchive = async (file: File) => {
    const passphrase = window.prompt('Enter archive passphrase to import:');
    if (!passphrase) return;

    try {
      const payloadText = await file.text();
      const decrypted = await decryptArchive(payloadText, passphrase);
      if (!Array.isArray(decrypted?.sessions)) {
        throw new Error('Invalid archive payload.');
      }
      setSessions(decrypted.sessions);
      setView('home');
      setActiveSession(null);
      alert(`Imported ${decrypted.sessions.length} session(s).`);
    } catch {
      alert('Archive import failed. Check passphrase and file integrity.');
    }
  };

  const handleCreateAISession = () => setView('ai-interview');
  const handleStartRecording = () => setView('recorder');
  const handleTriggerUpload = () => fileInputRef.current?.click();

  const processTranscriptionResult = async (transcriptText: string, type: 'AI_INTERVIEW' | 'RECORDED' | 'UPLOADED', audioUrl?: string) => {
    setIsAnalyzing(true);
    try {
      const analysis = await analyzeInterview(transcriptText, settings.language);
      const newSession: InterviewSession = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        duration: 0,
        type,
        analysis,
        codes: [],
        annotations: [],
        audioUrl
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSession(newSession);
      setView('analysis');
    } catch (error) {
      setAppNotice({
        type: 'analysis-error',
        message: 'Analysis failed to load. Check your network connection and try again.'
      });
      alert("MAPPING_PROTOCOL_FAILURE: Please check network status.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (text) await processTranscriptionResult(text, 'UPLOADED');
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleAIInterviewComplete = async (transcript: SpeakerSegment[]) => {
    if (transcript.length === 0) { setView('home'); return; }
    const transcriptText = transcript.map(t => `${t.speaker}: ${t.text}`).join('\n');
    await processTranscriptionResult(transcriptText, 'AI_INTERVIEW');
  };

  const handleRecordComplete = async (transcriptText: string, audioBlob: Blob) => {
    const audioUrl = URL.createObjectURL(audioBlob);
    await processTranscriptionResult(transcriptText, 'RECORDED', audioUrl);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("DELETE REPOSITORY? This action cannot be undone.")) {
      setSessions(prev => prev.filter(s => s.id !== id));
      if (activeSession?.id === id) { setView('home'); setActiveSession(null); }
    }
  };

  const filteredSessions = sessions.filter(s => {
    const matchesSearch = s.analysis?.summary.toLowerCase().includes(searchQuery.toLowerCase()) || s.date.includes(searchQuery);
    const matchesType = typeFilter === 'ALL' || s.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const renderHome = () => (
    <div className="flex flex-col gap-0 animate-in fade-in duration-500 max-w-7xl mx-auto w-full p-6 md:p-16 lg:p-24">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".txt"
        className="hidden"
      />

      <div className="mb-20">
        <div className="flex items-center gap-6 mb-8">
          <div className="w-16 h-16 bg-black flex items-center justify-center p-3 rounded-2xl shadow-xl">
            <Artifact className="text-white w-full h-full" />
          </div>
          <div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-none">
              NeuroPhenom
            </h1>
            <p className="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-400 mt-2">
              Micro-Phenomenological Protocol v1.3.3
            </p>
          </div>
        </div>
        <p className="text-xl font-medium max-w-3xl tracking-tight leading-relaxed text-neutral-600">
          A high-fidelity neurophenomenology interface for researcher and participant alike.
          Ease into lived experience through guided evocation, then codify and analyze micro-dynamics with diachronic and synchronic precision.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-black text-white p-10 flex flex-col gap-10 min-h-[340px] rounded-[32px] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-white/10 transition-colors" />
            <div className="w-14 h-14 border border-white/20 flex items-center justify-center rounded-xl bg-white/5">
              <MessageSquare size={28} className="text-white" />
            </div>
            <div className="relative z-10 mt-auto">
              <h3 className="text-3xl font-black uppercase tracking-tight mb-3">Conduct AI Interview</h3>
              <p className="text-xs font-bold uppercase tracking-widest opacity-40 mb-8">Guided Elicitation • {settings.language} Protocol</p>
              <Button
                onClick={handleCreateAISession}
                variant="secondary"
                size="lg"
                className="w-fit rounded-full px-8"
              >
                Initialize <ChevronRight size={18} className="ml-2" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div
              onClick={handleStartRecording}
              className="border-2 border-black p-8 flex flex-col gap-8 group hover:bg-neutral-50 transition-all cursor-pointer rounded-[24px]"
            >
              <div className="w-12 h-12 border-2 border-black/10 flex items-center justify-center rounded-xl group-hover:border-black/30 transition-colors">
                <Mic size={22} className="text-black" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest mb-1">Live Capture</h4>
                <p className="text-[10px] font-bold uppercase tracking-widest flex items-center text-neutral-400 group-hover:text-black transition-colors">
                  Record <ChevronRight size={12} className="ml-1" />
                </p>
              </div>
            </div>

            <div
              onClick={handleTriggerUpload}
              className="border-2 border-black p-8 flex flex-col gap-8 group hover:bg-neutral-50 transition-all cursor-pointer rounded-[24px]"
            >
              <div className="w-12 h-12 border-2 border-black/10 flex items-center justify-center rounded-xl group-hover:border-black/30 transition-colors">
                <FileText size={22} className="text-black" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest mb-1">Batch Import</h4>
                <p className="text-[10px] font-bold uppercase tracking-widest flex items-center text-neutral-400 group-hover:text-black transition-colors">
                  Upload .txt <Upload size={12} className="ml-1" />
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col gap-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b-2 border-black pb-6">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-black uppercase tracking-tight">Repository</h2>
              <span className="bg-black text-white text-[10px] font-black px-3 py-1 rounded-full">{filteredSessions.length}</span>
            </div>
            <div className="flex items-center border-2 border-black px-4 py-2 w-full md:w-72 bg-neutral-50 rounded-full focus-within:bg-white transition-colors">
              <Search size={16} className="mr-3 opacity-30" />
              <input
                type="text"
                placeholder="SEARCH REPOSITORY..."
                className="bg-transparent outline-none uppercase text-[10px] font-black tracking-widest w-full placeholder:text-neutral-300"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {filteredSessions.length === 0 ? (
            <div className="py-32 text-center border-2 border-dashed border-black/10 bg-neutral-50/50 rounded-[32px]">
              <p className="text-xs font-black uppercase tracking-[0.4em] text-neutral-300">Archive Offline</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 overflow-y-auto max-h-[700px] pr-2 no-scrollbar">
              {filteredSessions.map(session => (
                <div
                  key={session.id}
                  onClick={() => { setActiveSession(session); setView('analysis'); }}
                  className="group border-2 border-black p-8 hover:bg-black hover:text-white transition-all cursor-pointer rounded-[24px] flex flex-col gap-6 relative"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-lg border border-current flex items-center justify-center opacity-20">
                        <FileText size={14} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-60">
                        {new Date(session.date).toLocaleDateString()} • {session.type.replace('_', ' ')}
                      </span>
                    </div>
                    <button
                      onClick={(e) => deleteSession(session.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-2 hover:bg-white/10 rounded-lg transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <h3 className="text-2xl font-bold uppercase tracking-tight leading-tight line-clamp-2 max-w-[85%]">
                    {session.analysis?.summary || "Protocol Analysis Pending"}
                  </h3>

                  <div className="flex flex-wrap gap-2">
                    <span className="text-[9px] font-black uppercase border border-current px-3 py-1 rounded-full opacity-40 group-hover:opacity-70">
                      {session.analysis?.phasesCount || 0} Phases
                    </span>
                    {session.analysis?.modalities.slice(0, 3).map((m, i) => (
                      <span key={i} className="text-[9px] font-black uppercase border border-current px-3 py-1 rounded-full opacity-40 group-hover:opacity-70">
                        {m}
                      </span>
                    ))}
                  </div>

                  <ArrowRight size={20} className="absolute bottom-8 right-8 opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className="mt-40 p-16 border-t-2 border-black flex flex-col items-center gap-10">
        <a href="https://newpsychonaut.com" target="_blank" className="text-xs font-black uppercase tracking-[0.8em] hover:opacity-50 transition-opacity">
          NewPsychonaut.com
        </a>
        <div className="flex items-center gap-12 opacity-10">
          <Artifact className="h-10 w-10 text-black" />
          <div className="w-16 h-[2px] bg-black" />
          <Artifact className="h-10 w-10 text-black transform rotate-180" />
        </div>
      </footer>
    </div>
  );

  const showOfflineOverlay = !isOnline && !offlineAcknowledged;

  return (
    <div className="min-h-screen bg-white text-black flex flex-col font-sans selection:bg-black selection:text-white">
      <header className="h-24 border-b-2 border-black px-10 flex items-center justify-between sticky top-0 z-50 bg-white/90 backdrop-blur-md">
        <div className="flex items-center gap-5 cursor-pointer group" onClick={() => setView('home')}> 
          <div className="w-10 h-10 bg-black flex items-center justify-center p-2 rounded-xl group-hover:scale-110 transition-transform shadow-lg">
            <Artifact className="w-full h-full text-white" />
          </div> 
          <span className="text-2xl font-black tracking-tighter uppercase group-hover:tracking-normal transition-all">NeuroPhenom AI</span>
        </div> 
        <div className="flex items-center gap-6"> 
          <SettingsMenu 
            settings={settings} 
            onUpdate={setSettings} 
            onExportEncrypted={handleExportEncryptedArchive} 
            onImportEncrypted={handleImportEncryptedArchive} 
          />
        </div> 
      </header>

      <main className="flex-1 flex flex-col">
        {isAnalyzing && (
          <div className="fixed inset-0 bg-white/80 backdrop-blur-xl z-[100] flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-black border-t-transparent animate-spin mx-auto mb-10 rounded-full" />
              <h3 className="text-[12px] font-black uppercase tracking-[0.6em] animate-pulse">Mapping Subjective Space</h3>
            </div>
          </div>
        )}

        <div className="flex-1">
          {view === 'home' && renderHome()}
          {view === 'recorder' && (
            <StandaloneRecorder 
              apiKey={settings.apiKey} 
              onComplete={handleRecordComplete} 
              onCancel={() => setView('home')}
            />
          )}
          {view === 'ai-interview' && (
            <div className="p-0 h-[calc(100vh-96px)]">
              <LiveInterviewSession 
                settings={settings} 
                onComplete={handleAIInterviewComplete} 
                onCancel={() => setView('home')} 
              />
            </div>
          )}
          {view === 'analysis' && activeSession && (
            <div className="p-0 h-[calc(100vh-96px)] flex flex-col animate-in slide-in-from-bottom-8 duration-700">
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

      {view === 'home' && (
        <div className="fixed bottom-12 right-12 z-50 flex gap-4">
          <a href="https://buymeacoffee.com/stevebeale" target="_blank" className="w-16 h-16 bg-black text-white flex items-center justify-center rounded-2xl hover:scale-110 active:scale-95 transition-all shadow-2xl group">
            <Coffee size={24} className="group-hover:rotate-12 transition-transform" />
          </a>
        </div>
      )}

      {showOfflineOverlay && (
        <AppFallback 
          variant="offline" 
          message="Your device appears offline. You can continue in read-only mode or retry the connection." 
          primaryLabel="Retry Connection" 
          onPrimaryAction={() => window.location.reload()} 
          secondaryLabel="Continue Offline" 
          onSecondaryAction={() => setOfflineAcknowledged(true)} 
        />
      )}

      {appNotice && (
        <AppFallback 
          variant="analysis-error" 
          message={appNotice.message} 
          primaryLabel="Dismiss" 
          onPrimaryAction={() => setAppNotice(null)} 
          secondaryLabel="Reload" 
          onSecondaryAction={() => window.location.reload()} 
        />
      )}
    </div>
  );
};

export default App;