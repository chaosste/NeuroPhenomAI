import React, { useState, useRef, useEffect } from 'react';
import { AnalysisResult, Code, Annotation, InterviewSession } from '../types';
import { 
  Play, 
  Pause, 
  Download, 
  X, 
  History, 
  Clock, 
  FileText, 
  ArrowRight, 
  Layout, 
  Layers, 
  HardDrive, 
  RotateCcw, 
  Volume2, 
  Sparkles,
  Share2,
  Check
} from 'lucide-react';
import Button from './Button';
import { COLORS } from '../constants';
import { getAudioBlobUrl, exportCachedAudio, formatBytes } from '../services/audioCacheService';
import { analyzeInterview } from '../services/geminiService';

interface AnalysisViewProps {
  session: InterviewSession;
  onUpdate: (session: InterviewSession) => void;
}

const AnalysisView: React.FC<AnalysisViewProps> = ({ session, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'coding' | 'report'>('coding');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(session.duration || 0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [resolvedAudioUrl, setResolvedAudioUrl] = useState<string | null>(session.audioUrl || null);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [selection, setSelection] = useState<{ segmentIndex: number; start: number; end: number; rect: DOMRect | null } | null>(null);
  const [newCodeName, setNewCodeName] = useState('');
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  // Rehydrate audio from IndexedDB cache if transient URL is missing/expired
  useEffect(() => {
    let isMounted = true;
    async function loadAudio() {
      try {
        const url = await getAudioBlobUrl(session.id);
        if (isMounted && url) {
          setResolvedAudioUrl(url);
        }
      } catch (e) {
        console.warn('Could not rehydrate audio from IndexedDB:', e);
      }
    }
    loadAudio();
    return () => {
      isMounted = false;
    };
  }, [session.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [resolvedAudioUrl]);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.warn('Playback error:', err);
      });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const jumpToTime = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
    if (!isPlaying) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2, 0.75];
    const nextSpeed = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const handleTextSelection = (segmentIndex: number) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const parent = (container.nodeType === 3 ? container.parentElement : container) as HTMLElement | null;

    if (!parent?.classList?.contains('segment-text-container')) {
      setSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    const start = Math.min(sel.anchorOffset, sel.focusOffset);
    const end = Math.max(sel.anchorOffset, sel.focusOffset);
    setSelection({ segmentIndex, start, end, rect });
  };

  const applyCode = (codeId: string) => {
    if (!selection) return;
    const newAnnotation: Annotation = {
      id: crypto.randomUUID(),
      codeId,
      segmentIndex: selection.segmentIndex,
      startOffset: selection.start,
      endOffset: selection.end,
      text: session.analysis?.transcript[selection.segmentIndex]?.text.substring(selection.start, selection.end) || '',
    };
    onUpdate({ ...session, annotations: [...session.annotations, newAnnotation] });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const addCode = () => {
    if (!newCodeName.trim()) return;
    const newCode: Code = {
      id: crypto.randomUUID(),
      name: newCodeName.trim(),
      color: COLORS.codeColors[session.codes.length % COLORS.codeColors.length],
    };
    onUpdate({ ...session, codes: [...session.codes, newCode] });
    setNewCodeName('');
  };

  const handleDownloadAudio = async () => {
    await exportCachedAudio(session.id);
  };

  const handleDownloadSession = async () => {
    const exportData = {
      sessionId: session.id,
      date: session.date,
      type: session.type,
      duration: session.duration,
      summary: session.analysis?.summary || '',
      transcript: session.analysis?.transcript || [],
      takeaways: session.analysis?.takeaways || [],
      modalities: session.analysis?.modalities || [],
      phasesCount: session.analysis?.phasesCount || 0,
      diachronicStructure: session.analysis?.diachronicStructure || [],
      synchronicStructure: session.analysis?.synchronicStructure || [],
      thematicCodes: session.codes || [],
      codedAnnotations: session.annotations || [],
      rawAnalysis: session.analysis,
      exportMetadata: {
        exportedAt: new Date().toISOString(),
        format: 'neurophenom-v1.4',
        protocol: 'Micro-Phenomenological Architecture',
      },
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const safeSummary = (session.analysis?.summary || 'session')
      .slice(0, 24)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const filename = `neurophenom_analysis_${safeSummary || session.id.slice(0, 8)}_${dateStamp}.json`;

    // 1. Attempt File System Access API (window.showSaveFilePicker)
    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
      try {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: 'JSON Analysis & Transcript (*.json)',
              accept: {
                'application/json': ['.json'],
              },
            },
          ],
        });
        const writableStream = await fileHandle.createWritable();
        await writableStream.write(jsonString);
        await writableStream.close();
        setDownloadSuccess(true);
        setTimeout(() => setDownloadSuccess(false), 3000);
        return;
      } catch (err: any) {
        // If user actively cancelled the picker dialog, do not trigger fallback or error
        if (err.name === 'AbortError') {
          return;
        }
        console.warn('File System Access API failed or restricted, falling back to Blob download:', err);
      }
    }

    // 2. Blob-based download mechanism fallback
    try {
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (blobErr) {
      console.error('Blob download failed:', blobErr);
      alert('Could not download session analysis file.');
    }
  };

  const handleReanalyze = async () => {
    if (!session.analysis?.transcript || session.analysis.transcript.length === 0) return;
    setIsReanalyzing(true);
    try {
      const fullText = session.analysis.transcript.map(t => `${t.speaker}: ${t.text}`).join('\n');
      const updatedAnalysis = await analyzeInterview(fullText, 'UK' as any);
      onUpdate({ ...session, analysis: updatedAnalysis });
    } catch (err) {
      alert('Could not complete re-analysis: ' + (err as any).message);
    } finally {
      setIsReanalyzing(false);
    }
  };

  const renderSegmentText = (text: string, segmentIndex: number) => {
    const segmentAnnotations = session.annotations
      .filter(a => a.segmentIndex === segmentIndex)
      .sort((a, b) => a.startOffset - b.startOffset);

    if (segmentAnnotations.length === 0) {
      return (
        <p 
          onMouseUp={() => handleTextSelection(segmentIndex)}
          className="segment-text-container text-xl md:text-2xl leading-[1.5] text-neutral-900 font-semibold tracking-tight select-text"
        >
          {text}
        </p>
      );
    }

    let lastIndex = 0;
    const parts = [];

    segmentAnnotations.forEach((anno) => {
      if (anno.startOffset > lastIndex) {
        parts.push(text.substring(lastIndex, anno.startOffset));
      }
      const code = session.codes.find(c => c.id === anno.codeId);
      parts.push(
        <mark 
          key={anno.id}
          className="bg-neutral-200 border-b-4 border-black relative group/mark cursor-pointer px-1 py-0.5 rounded"
          title={code?.name}
        >
          {text.substring(anno.startOffset, anno.endOffset)}
          <span className="absolute -top-7 left-0 text-[9px] font-black uppercase tracking-widest bg-black text-white px-2 py-0.5 opacity-0 group-hover/mark:opacity-100 transition-opacity whitespace-nowrap z-20 rounded shadow-md">
            {code?.name}
          </span>
        </mark>
      );
      lastIndex = anno.endOffset;
    });

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return (
      <div 
        onMouseUp={() => handleTextSelection(segmentIndex)}
        className="segment-text-container text-xl md:text-2xl leading-[1.5] text-neutral-900 font-semibold tracking-tight select-text"
      >
        {parts}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden font-sans">
      {resolvedAudioUrl && <audio ref={audioRef} src={resolvedAudioUrl} />}

      {/* Top Playback & Control Bar */}
      <div className="flex flex-wrap items-center justify-between px-6 md:px-10 py-4 border-b-2 border-black bg-white z-10 gap-4 shadow-sm">
        <div className="flex items-center gap-6 md:gap-10">
          {resolvedAudioUrl ? (
            <div className="flex items-center gap-4">
              <button 
                onClick={togglePlayback} 
                className="w-12 h-12 bg-black text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md rounded-2xl"
                title={isPlaying ? "Pause audio" : "Play audio"}
              >
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
              </button>

              <div className="flex flex-col min-w-[160px] md:min-w-[240px]">
                <div className="flex justify-between items-baseline gap-2 mb-1.5">
                  <span className="text-xs font-mono font-bold tracking-tight">{formatTime(currentTime)}</span>
                  <span className="text-[10px] font-mono font-bold text-neutral-400">/ {formatTime(duration)}</span>
                </div>
                <input 
                  type="range"
                  min="0"
                  max={duration || 100}
                  step="0.1"
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-1.5 bg-neutral-200 accent-black rounded-lg cursor-pointer"
                />
              </div>

              <button
                onClick={cycleSpeed}
                className="px-2.5 py-1 text-[10px] font-mono font-black border border-black/20 rounded-md hover:bg-neutral-100"
                title="Change playback speed"
              >
                {playbackRate}x
              </button>

              <button
                onClick={handleDownloadAudio}
                className="p-2 border border-black/20 rounded-lg hover:bg-neutral-100 text-neutral-700 hover:text-black transition-colors"
                title="Download cached audio file"
              >
                <Download size={16} />
              </button>

              <div className="hidden xl:flex items-center gap-1.5 text-[9px] font-mono text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                <HardDrive size={11} />
                <span>Audio Cached in IndexedDB Vault</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-bold text-neutral-400">
              <FileText size={16} />
              <span>Transcript Repository (Text Mode)</span>
            </div>
          )}

          <div className="hidden lg:flex gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleReanalyze}
              loading={isReanalyzing}
              className="rounded-full text-[10px] font-black tracking-widest flex items-center gap-2"
            >
              <Sparkles size={12} /> Re-analyze
            </Button>
          </div>
        </div>

        {/* Tab switcher & Download Action */}
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleDownloadSession}
            className={`rounded-2xl text-[10px] font-black tracking-widest flex items-center gap-2 border-2 border-black transition-all ${
              downloadSuccess 
                ? 'bg-black text-white' 
                : 'bg-white hover:bg-neutral-100 text-black'
            }`}
            title="Download structured JSON session analysis and transcript"
          >
            {downloadSuccess ? (
              <>
                <Check size={14} className="text-emerald-400" />
                <span>Downloaded</span>
              </>
            ) : (
              <>
                <Download size={14} />
                <span>Download</span>
              </>
            )}
          </Button>

          <div className="flex bg-neutral-100 p-1 rounded-2xl border border-black/5">
            <button 
              onClick={() => setActiveTab('coding')}
              className={`px-5 md:px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl ${
                activeTab === 'coding' ? 'bg-black text-white shadow-sm' : 'text-neutral-500 hover:text-black'
              }`}
            >
              Transcript
            </button>
            <button 
              onClick={() => setActiveTab('report')}
              className={`px-5 md:px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl ${
                activeTab === 'report' ? 'bg-black text-white shadow-sm' : 'text-neutral-500 hover:text-black'
              }`}
            >
              Synthesis
            </button>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'coding' ? (
          <>
            {/* Transcript & Annotation Column */}
            <div className="flex-1 overflow-y-auto p-8 md:p-16 lg:p-24 border-r-2 border-black bg-[#fafafa] no-scrollbar">
              <div className="max-w-3xl mx-auto space-y-16">
                <header className="border-b-2 border-black pb-10">
                  <div className="flex items-center gap-3 mb-4 opacity-40">
                    <History size={16} />
                    <span className="text-[10px] font-black uppercase tracking-[0.5em]">Phenomenological Transcript</span>
                  </div>
                  <h3 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-6 leading-tight">
                    {session.analysis?.summary || "Protocol Transcript Analysis"}
                  </h3>
                  <div className="flex flex-wrap gap-8 text-neutral-500 text-xs font-mono">
                    <div>
                      <span className="block text-[9px] font-black uppercase tracking-widest text-neutral-400">Date</span>
                      <span className="font-bold text-black">{new Date(session.date).toLocaleDateString()}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black uppercase tracking-widest text-neutral-400">Type</span>
                      <span className="font-bold text-black">{session.type.replace('_', ' ')}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black uppercase tracking-widest text-neutral-400">Phases</span>
                      <span className="font-bold text-black">{session.analysis?.phasesCount || 0} Diachronic Slices</span>
                    </div>
                  </div>
                </header>

                <div className="space-y-12">
                  {session.analysis?.transcript && session.analysis.transcript.length > 0 ? (
                    session.analysis.transcript.map((segment, idx) => (
                      <div key={idx} className="group relative">
                        <div className="flex items-center justify-between mb-4 border-b border-black/10 pb-2">
                          <div className="flex items-center gap-4">
                            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${
                              segment.speaker === 'AI' 
                                ? 'bg-black text-white' 
                                : 'bg-white border border-black text-black'
                            }`}>
                              {segment.speaker}
                            </span>
                            {segment.startTime !== undefined && (
                              <button 
                                onClick={() => jumpToTime(segment.startTime || 0)}
                                className="text-[10px] font-mono text-neutral-400 font-bold hover:text-black flex items-center gap-1 transition-colors"
                                title="Click to jump to audio timestamp"
                              >
                                <Clock size={10} />
                                [{formatTime(segment.startTime)}]
                              </button>
                            )}
                          </div>
                        </div>

                        {renderSegmentText(segment.text, idx)}

                        {/* Annotations under segment */}
                        <div className="flex flex-wrap gap-2 mt-4">
                          {session.annotations
                            .filter(a => a.segmentIndex === idx)
                            .map(a => {
                              const code = session.codes.find(c => c.id === a.codeId);
                              return (
                                <div 
                                  key={a.id}
                                  className="group/anno px-3 py-1 text-[9px] font-black uppercase border border-black flex items-center gap-2 hover:bg-black hover:text-white transition-all rounded-md"
                                >
                                  <span>{code?.name || 'Theme'}: "{a.text.slice(0, 30)}"</span>
                                  <X 
                                    size={12} 
                                    className="cursor-pointer opacity-40 group-hover/anno:opacity-100 hover:text-red-400" 
                                    onClick={() => onUpdate({ ...session, annotations: session.annotations.filter(an => an.id !== a.id) })} 
                                  />
                                </div>
                              );
                            })
                          }
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-20 text-neutral-400">
                      <p className="text-sm font-bold uppercase tracking-widest">No transcript segments available</p>
                      <Button size="sm" onClick={handleReanalyze} className="mt-4">
                        Generate Transcript & Analysis
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Fragment Coding Popup */}
              {selection && (
                <div 
                  className="fixed z-[100] bg-black text-white p-5 flex flex-col gap-4 min-w-[260px] shadow-2xl animate-in zoom-in-95 duration-150 rounded-2xl"
                  style={{ top: selection.rect ? selection.rect.bottom + 12 : 0, left: selection.rect ? selection.rect.left : 0 }}
                >
                  <div className="flex justify-between items-center border-b border-white/20 pb-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">Codify Fragment</p>
                    <button onClick={() => setSelection(null)} className="hover:opacity-50"><X size={14} /></button>
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto pr-1 no-scrollbar">
                    {session.codes.length === 0 && (
                      <p className="text-[10px] font-bold text-neutral-400 uppercase italic py-2">Add a theme in the Atlas sidebar first...</p>
                    )}
                    {session.codes.map(code => (
                      <button 
                        key={code.id} 
                        onClick={() => applyCode(code.id)} 
                        className="text-left text-[11px] font-bold uppercase py-2 px-3 hover:bg-white hover:text-black transition-colors flex items-center justify-between rounded-lg"
                      >
                        {code.name}
                        <ArrowRight size={12} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Thematic Atlas */}
            <aside className="w-[340px] lg:w-[380px] p-8 md:p-12 bg-white overflow-y-auto no-scrollbar border-l-2 border-black flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-8">
                  <Layers size={18} className="text-black" />
                  <h3 className="text-xs font-black uppercase tracking-[0.4em]">Thematic Atlas</h3>
                </div>

                <div className="mb-10">
                  <div className="flex flex-col gap-3">
                    <input 
                      type="text" 
                      value={newCodeName}
                      onChange={(e) => setNewCodeName(e.target.value)}
                      placeholder="NEW THEME (E.G. FELT HORIZON)..."
                      className="w-full bg-transparent border-b-2 border-black pb-2 text-xs font-black outline-none uppercase tracking-widest placeholder:text-neutral-300 focus:border-neutral-900 transition-colors"
                      onKeyDown={(e) => e.key === 'Enter' && addCode()}
                    />
                    <Button onClick={addCode} className="w-full rounded-xl" size="sm">
                      Catalog Theme
                    </Button>
                  </div>
                </div>

                <div className="space-y-6">
                  {session.codes.map(code => {
                    const count = session.annotations.filter(a => a.codeId === code.id).length;
                    return (
                      <div key={code.id} className="flex flex-col gap-2 group">
                        <div className="flex justify-between items-end border-b border-black/10 pb-2 group-hover:border-black transition-colors">
                          <span className="text-xs font-black uppercase tracking-widest">{code.name}</span>
                          <span className="text-[10px] font-mono font-black bg-neutral-100 px-2.5 py-0.5 rounded-full group-hover:bg-black group-hover:text-white transition-colors">
                            {count}
                          </span>
                        </div>
                        <div className="flex gap-1 h-1">
                          {[...Array(8)].map((_, i) => (
                            <div 
                              key={i} 
                              className={`h-full flex-1 rounded-full transition-all duration-300 ${
                                i < count ? 'bg-black' : 'bg-neutral-100'
                              }`} 
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {session.codes.length === 0 && (
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 text-center py-6">
                      No themes defined yet. Create themes to annotate experiential fragments.
                    </p>
                  )}
                </div>
              </div>

              {resolvedAudioUrl && (
                <div className="pt-8 border-t border-black/10 mt-10">
                  <div className="p-4 bg-neutral-50 rounded-2xl border border-black/10 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400 block">Local Vault</span>
                      <span className="text-xs font-mono font-bold text-neutral-800">Recording Cached</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleDownloadAudio} className="text-[9px]">
                      Export Audio
                    </Button>
                  </div>
                </div>
              )}
            </aside>
          </>
        ) : (
          /* Report Tab: Deep Phenomenological Synthesis */
          <div className="flex-1 overflow-y-auto p-8 md:p-16 lg:p-24 bg-white no-scrollbar">
            <div className="max-w-4xl mx-auto space-y-24 pb-24">
              <section className="animate-in fade-in duration-500">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
                  <div className="flex items-center gap-3 opacity-40">
                    <FileText size={18} />
                    <h4 className="text-[10px] font-black uppercase tracking-[0.6em]">Structural Synthesis</h4>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleDownloadSession}
                    className="rounded-full text-[10px] font-black tracking-widest flex items-center gap-2 border-black"
                  >
                    {downloadSuccess ? (
                      <>
                        <Check size={12} className="text-emerald-500" /> Exported JSON
                      </>
                    ) : (
                      <>
                        <Download size={12} /> Download Session JSON
                      </>
                    )}
                  </Button>
                </div>
                <div className="border-l-4 border-black pl-8 py-2">
                  <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-tight">
                    "{session.analysis?.summary}"
                  </h2>
                </div>
              </section>

              {/* Key Phenomenological Takeaways */}
              {session.analysis?.takeaways && session.analysis.takeaways.length > 0 && (
                <section>
                  <h4 className="text-xs font-black uppercase tracking-[0.4em] mb-6 text-neutral-400">
                    Core Experiential Findings
                  </h4>
                  <div className="grid md:grid-cols-2 gap-4">
                    {session.analysis.takeaways.map((takeaway, i) => (
                      <div key={i} className="p-6 border-2 border-black rounded-2xl bg-neutral-50 flex gap-4 items-start">
                        <span className="text-xs font-mono font-black bg-black text-white px-2 py-1 rounded">
                          0{i + 1}
                        </span>
                        <p className="text-sm font-semibold leading-relaxed text-neutral-800">{takeaway}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Diachronic Sequence & Synchronic Dynamics */}
              <div className="grid lg:grid-cols-2 gap-16">
                {/* Diachronic Timeline */}
                <section>
                  <div className="flex items-center gap-3 mb-8">
                    <Clock size={18} className="text-black" />
                    <h4 className="text-xs font-black uppercase tracking-[0.4em]">Diachronic Sequence</h4>
                  </div>
                  <div className="space-y-8 relative pl-6 border-l-2 border-black/10">
                    {session.analysis?.diachronicStructure.map((phase, i) => (
                      <div key={i} className="relative group">
                        <div className="absolute -left-[31px] top-1 w-3.5 h-3.5 bg-white border-2 border-black rounded-full group-hover:bg-black transition-colors" />
                        <span className="text-[9px] font-mono font-black uppercase text-neutral-400 tracking-widest block mb-1">
                          Phase 0{i + 1} • {phase.startTime}
                        </span>
                        <h5 className="text-xl font-black uppercase tracking-tight mb-2">{phase.phaseName}</h5>
                        <p className="text-sm font-medium leading-relaxed text-neutral-600">{phase.description}</p>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Synchronic Dynamics */}
                <section>
                  <div className="flex items-center gap-3 mb-8">
                    <Layout size={18} className="text-black" />
                    <h4 className="text-xs font-black uppercase tracking-[0.4em]">Synchronic Dynamics</h4>
                  </div>
                  <div className="space-y-4">
                    {session.analysis?.synchronicStructure.map((struct, i) => (
                      <div key={i} className="border-2 border-black p-6 rounded-2xl bg-[#fafafa]">
                        <span className="text-[9px] font-black uppercase tracking-widest bg-black text-white px-3 py-1 rounded-full inline-block mb-3">
                          {struct.category}
                        </span>
                        <p className="text-base font-bold uppercase leading-snug tracking-tight">{struct.details}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* Sensory & Somatic Modalities Registry */}
              <section className="pt-16 border-t-2 border-black">
                <h4 className="text-xs font-black uppercase tracking-[0.4em] mb-10">Sensory Modalities Registry</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {session.analysis?.modalities.map((m, i) => (
                    <div key={i} className="border-2 border-black p-6 rounded-2xl hover:bg-black hover:text-white transition-all flex flex-col justify-between h-32">
                      <span className="text-[10px] font-mono font-black opacity-40">MODALITY_0{i + 1}</span>
                      <span className="text-sm font-black uppercase tracking-wider">{m}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisView;
