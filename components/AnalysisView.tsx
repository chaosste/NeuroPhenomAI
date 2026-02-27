
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
  Layers
} from 'lucide-react';
import Button from './Button';
import { COLORS } from '../constants';

interface AnalysisViewProps {
  session: InterviewSession;
  onUpdate: (session: InterviewSession) => void;
}

const AnalysisView: React.FC<AnalysisViewProps> = ({ session, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'coding' | 'report'>('coding');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [selection, setSelection] = useState<{ segmentIndex: number; start: number; end: number; rect: DOMRect | null } | null>(null);
  const [newCodeName, setNewCodeName] = useState('');
  
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      const audio = audioRef.current;
      const updateTime = () => setCurrentTime(audio.currentTime);
      audio.addEventListener('timeupdate', updateTime);
      return () => audio.removeEventListener('timeupdate', updateTime);
    }
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const togglePlayback = () => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleTextSelection = (segmentIndex: number) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { setSelection(null); return; }
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
      text: session.analysis?.transcript[selection.segmentIndex].text.substring(selection.start, selection.end) || ''
    };
    onUpdate({ ...session, annotations: [...session.annotations, newAnnotation] });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const addCode = () => {
    if (!newCodeName.trim()) return;
    const newCode: Code = {
      id: crypto.randomUUID(),
      name: newCodeName,
      color: COLORS.codeColors[session.codes.length % COLORS.codeColors.length]
    };
    onUpdate({ ...session, codes: [...session.codes, newCode] });
    setNewCodeName('');
  };

  const importAISuggestedCodebook = () => {
    const suggestions = session.analysis?.codebookSuggestions || [];
    if (suggestions.length === 0) return;

    const existing = new Set(session.codes.map(code => code.name.trim().toLowerCase()));
    const additions: Code[] = [];

    suggestions.forEach((s) => {
      const label = s.label.trim();
      if (!label) return;
      if (existing.has(label.toLowerCase())) return;
      additions.push({
        id: crypto.randomUUID(),
        name: label,
        color: COLORS.codeColors[(session.codes.length + additions.length) % COLORS.codeColors.length]
      });
    });

    if (additions.length === 0) return;
    onUpdate({ ...session, codes: [...session.codes, ...additions] });
  };

  const exportProtocolPackage = () => {
    const payload = {
      protocolVersion: "neurophenom-v1.4",
      exportedAt: new Date().toISOString(),
      session: {
        id: session.id,
        date: session.date,
        duration: session.duration,
        type: session.type
      },
      coding: {
        codes: session.codes,
        annotations: session.annotations
      },
      analysis: session.analysis
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `neurophenom-protocol-${session.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  const renderSegmentText = (text: string, segmentIndex: number) => {
    const segmentAnnotations = session.annotations
      .filter(a => a.segmentIndex === segmentIndex)
      .sort((a, b) => a.startOffset - b.startOffset);

    if (segmentAnnotations.length === 0) {
      return (
        <p 
          onMouseUp={() => handleTextSelection(segmentIndex)}
          className="segment-text-container text-2xl leading-[1.4] text-black font-semibold tracking-tight select-text"
        >
          {text}
        </p>
      );
    }

    let lastIndex = 0;
    const parts = [];

    segmentAnnotations.forEach((anno, i) => {
      if (anno.startOffset > lastIndex) {
        parts.push(text.substring(lastIndex, anno.startOffset));
      }
      const code = session.codes.find(c => c.id === anno.codeId);
      parts.push(
        <mark 
          key={anno.id}
          className="bg-black/5 border-b-4 border-black relative group/mark cursor-help px-0.5"
          title={code?.name}
        >
          {text.substring(anno.startOffset, anno.endOffset)}
          <span className="absolute -top-8 left-0 text-[9px] font-black uppercase tracking-widest bg-black text-white px-2 py-0.5 opacity-0 group-hover/mark:opacity-100 transition-opacity whitespace-nowrap z-10 rounded">
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
        className="segment-text-container text-2xl leading-[1.4] text-black font-semibold tracking-tight select-text"
      >
        {parts}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden font-sans">
      <audio ref={audioRef} src={session.audioUrl} />

      <div className="flex items-center justify-between px-10 py-5 border-b-2 border-black bg-white z-10 shadow-sm">
        <div className="flex items-center gap-12">
          <div className="flex items-center gap-6">
            <button 
              onClick={togglePlayback} 
              className="w-14 h-14 bg-black text-white flex items-center justify-center hover:scale-105 transition-all shadow-xl rounded-2xl active:scale-95"
            >
              {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
            </button>
            <div className="flex flex-col min-w-[200px]">
              <div className="flex justify-between items-baseline gap-4 mb-2">
                <span className="text-xs font-black tracking-widest uppercase">{formatTime(currentTime)}</span>
                <span className="text-[10px] font-bold text-neutral-300">/ {formatTime(session.duration)}</span>
              </div>
              <div className="h-2 bg-neutral-100 rounded-full relative overflow-hidden">
                <div 
                  className="absolute top-0 left-0 h-full bg-black transition-all duration-100" 
                  style={{ width: `${(currentTime / session.duration) * 100}%` }} 
                />
              </div>
            </div>
          </div>
          <div className="h-10 w-[2px] bg-neutral-100 hidden lg:block" />
          <div className="hidden lg:flex gap-4">
            <Button variant="outline" size="sm" className="px-5 py-2.5 rounded-full text-[10px] font-black tracking-widest">METADATA</Button>
            <Button
              variant="outline"
              size="sm"
              className="px-5 py-2.5 rounded-full text-[10px] font-black tracking-widest"
              onClick={exportProtocolPackage}
            >
              EXPORT protocol
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex bg-neutral-100 p-1.5 rounded-2xl">
            <button 
              onClick={() => setActiveTab('coding')}
              className={`px-8 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl ${activeTab === 'coding' ? 'bg-black text-white shadow-lg' : 'text-neutral-400 hover:text-black'}`}
            >
              Transcript
            </button>
            <button 
              onClick={() => setActiveTab('report')}
              className={`px-8 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl ${activeTab === 'report' ? 'bg-black text-white shadow-lg' : 'text-neutral-400 hover:text-black'}`}
            >
              Synthesis
            </button>
          </div>
          <button className="p-3 hover:bg-neutral-100 rounded-xl transition-colors">
            <Download size={22} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'coding' ? (
          <>
            <div className="flex-1 overflow-y-auto p-12 md:p-24 lg:p-36 border-r-2 border-black bg-[#fafafa] no-scrollbar">
              <div className="max-w-3xl mx-auto space-y-32">
                <header className="mb-32 border-b-2 border-black pb-16">
                  <div className="flex items-center gap-3 mb-8 opacity-20">
                    <History size={16} />
                    <span className="text-[10px] font-black uppercase tracking-[0.6em]">Phenomenological_Registry</span>
                  </div>
                  <h3 className="text-6xl lg:text-8xl font-black uppercase tracking-tighter mb-10 leading-[0.85]">{session.analysis?.summary}</h3>
                  <div className="flex gap-12">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase text-neutral-400 tracking-widest mb-2">Registry_Date</span>
                      <span className="text-sm font-bold uppercase">{new Date(session.date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase text-neutral-400 tracking-widest mb-2">Protocol_ID</span>
                      <span className="text-sm font-bold uppercase">{session.id.split('-')[0]}</span>
                    </div>
                  </div>
                </header>

                <div className="space-y-24">
                  {session.analysis?.transcript.map((segment, idx) => (
                    <div key={idx} className="group relative">
                      <div className="flex items-center justify-between mb-8 border-b border-black/5 pb-4">
                        <div className="flex items-center gap-5">
                          <span className={`text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-full ${segment.speaker === 'AI' ? 'bg-black text-white' : 'bg-white border-2 border-black text-black'}`}>
                            {segment.speaker}
                          </span>
                          <span className="text-[10px] font-mono text-neutral-300 font-bold">[{formatTime(segment.startTime || 0)}]</span>
                        </div>
                      </div>
                      
                      {renderSegmentText(segment.text, idx)}
                      
                      <div className="flex flex-wrap gap-2 mt-8">
                        {session.annotations
                          .filter(a => a.segmentIndex === idx)
                          .map(a => {
                            const code = session.codes.find(c => c.id === a.codeId);
                            return (
                              <div 
                                key={a.id}
                                className="group/anno px-4 py-1.5 text-[9px] font-black uppercase border-2 border-black flex items-center gap-4 hover:bg-black hover:text-white transition-all cursor-default rounded-lg"
                              >
                                <span>{code?.name}: "{a.text}"</span>
                                <X 
                                  size={12} 
                                  className="cursor-pointer opacity-0 group-hover/anno:opacity-100 hover:text-red-400" 
                                  onClick={() => onUpdate({ ...session, annotations: session.annotations.filter(an => an.id !== a.id) })} 
                                />
                              </div>
                            );
                          })
                        }
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selection && (
                <div 
                  className="fixed z-[100] bg-black text-white p-6 flex flex-col gap-5 min-w-[280px] shadow-2xl animate-in zoom-in-95 duration-200 rounded-2xl"
                  style={{ top: selection.rect ? selection.rect.bottom + 16 : 0, left: selection.rect ? selection.rect.left : 0 }}
                >
                  <div className="flex justify-between items-center border-b border-white/10 pb-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">Codify Fragment</p>
                    <button onClick={() => setSelection(null)} className="hover:opacity-50"><X size={14} /></button>
                  </div>
                  <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto pr-2 no-scrollbar">
                    {session.codes.length === 0 && (
                      <p className="text-[10px] font-bold text-neutral-500 uppercase italic py-4">Define taxonomy first...</p>
                    )}
                    {session.codes.map(code => (
                      <button 
                        key={code.id} 
                        onClick={() => applyCode(code.id)} 
                        className="text-left text-[12px] font-bold uppercase py-2 px-4 hover:bg-white hover:text-black transition-colors flex items-center justify-between group/btn rounded-lg"
                      >
                        {code.name}
                        <ArrowRight size={12} className="opacity-0 group-hover/btn:opacity-100 transition-transform" />
                      </button>
                    ))}
                  </div>
                  <div className="pt-3 border-t border-white/10 flex justify-between">
                    <p className="text-[8px] font-mono opacity-40 uppercase">Fragment_{selection.end - selection.start}c</p>
                    <p className="text-[8px] font-mono opacity-40 uppercase">Neuro_Map</p>
                  </div>
                </div>
              )}
            </div>

            <aside className="w-[400px] p-16 bg-white overflow-y-auto no-scrollbar border-l-2 border-black">
              <div className="flex items-center gap-4 mb-12">
                <Layers size={20} className="text-black" />
                <h3 className="text-sm font-black uppercase tracking-[0.4em]">Thematic Atlas</h3>
              </div>
              
              <div className="mb-20">
                <div className="flex flex-col gap-4">
                  <input 
                    type="text" 
                    value={newCodeName}
                    onChange={(e) => setNewCodeName(e.target.value)}
                    placeholder="ENTER NEW THEME..."
                    className="w-full bg-transparent border-b-2 border-black pb-4 text-sm font-black outline-none uppercase tracking-widest placeholder:text-neutral-200 focus:placeholder:text-transparent transition-all"
                    onKeyDown={(e) => e.key === 'Enter' && addCode()}
                  />
                  <Button onClick={addCode} className="w-full rounded-xl" size="md">Catalog Theme</Button>
                </div>
              </div>

              {(session.analysis?.codebookSuggestions?.length || 0) > 0 && (
                <div className="mb-16 p-6 border-2 border-black rounded-2xl bg-[#fafafa]">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.25em]">AI Codebook Seeds</p>
                    <Button
                      size="sm"
                      className="rounded-lg px-3 py-1.5 text-[10px] tracking-wider"
                      onClick={importAISuggestedCodebook}
                    >
                      Import All
                    </Button>
                  </div>
                  <div className="space-y-4 max-h-64 overflow-y-auto no-scrollbar pr-1">
                    {session.analysis?.codebookSuggestions?.map((suggestion, i) => (
                      <div key={`${suggestion.label}-${i}`} className="border border-black/10 rounded-xl p-3 bg-white">
                        <p className="text-xs font-black uppercase tracking-wide mb-1">{suggestion.label}</p>
                        <p className="text-[11px] text-neutral-600 leading-relaxed mb-2">{suggestion.rationale}</p>
                        <p className="text-[10px] italic text-neutral-500">"{suggestion.exemplarQuote}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-12">
                {session.codes.map(code => {
                  const count = session.annotations.filter(a => a.codeId === code.id).length;
                  return (
                    <div key={code.id} className="flex flex-col gap-3 group">
                      <div className="flex justify-between items-end border-b-2 border-black/5 pb-3 group-hover:border-black transition-colors">
                        <span className="text-xs font-black uppercase tracking-widest">{code.name}</span>
                        <span className="text-[10px] font-mono font-black bg-neutral-100 px-3 py-1 rounded-full group-hover:bg-black group-hover:text-white transition-colors">{count}</span>
                      </div>
                      <div className="flex gap-1.5 h-1.5 px-0.5">
                        {[...Array(10)].map((_, i) => (
                          <div 
                            key={i} 
                            className={`h-full flex-1 rounded-full transition-all duration-300 ${i < count ? 'bg-black' : 'bg-neutral-100'}`} 
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-16 md:p-32 lg:p-48 bg-white no-scrollbar">
            <div className="max-w-5xl mx-auto space-y-48 pb-48">
              <section className="animate-in fade-in slide-in-from-bottom-12 duration-1000">
                <div className="flex items-center gap-4 mb-16 opacity-30">
                  <FileText size={20} />
                  <h4 className="text-[11px] font-black uppercase tracking-[0.8em]">Structural Synthesis v.1.0</h4>
                </div>
                <div className="relative">
                  <div className="absolute -left-16 top-0 bottom-0 w-3 bg-black rounded-full" />
                  <p className="text-7xl lg:text-9xl font-black uppercase tracking-tighter leading-[0.8] italic">
                    "{session.analysis?.summary}"
                  </p>
                </div>
              </section>

              <div className="grid lg:grid-cols-2 gap-40">
                <section className="animate-in fade-in slide-in-from-bottom-20 duration-1000 delay-200">
                  <div className="flex items-center gap-4 mb-16">
                    <Clock size={20} className="text-black" />
                    <h4 className="text-sm font-black uppercase tracking-[0.4em]">Diachronic Sequence</h4>
                  </div>
                  <div className="space-y-24 relative">
                    <div className="absolute left-[9px] top-6 bottom-6 w-1 bg-black opacity-5 rounded-full" />
                    {session.analysis?.diachronicStructure.map((phase, i) => (
                      <div key={i} className="group relative pl-12">
                        <div className="absolute left-0 top-1.5 w-5 h-5 bg-white border-4 border-black rounded-full z-10 group-hover:bg-black transition-all group-hover:scale-125" />
                        <div className="mb-6">
                          <span className="text-[10px] font-black mb-2 block opacity-30 tracking-[0.4em]">FRAGMENT_0{i + 1}</span>
                          <h5 className="text-3xl font-black uppercase tracking-tight group-hover:translate-x-3 transition-transform">{phase.phaseName}</h5>
                        </div>
                        <p className="text-lg font-medium leading-relaxed text-neutral-500 max-w-lg">{phase.description}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="animate-in fade-in slide-in-from-bottom-20 duration-1000 delay-400">
                  <div className="flex items-center gap-4 mb-16">
                    <Layout size={20} className="text-black" />
                    <h4 className="text-sm font-black uppercase tracking-[0.4em]">Synchronic Dynamics</h4>
                  </div>
                  <div className="grid gap-8">
                    {session.analysis?.synchronicStructure.map((struct, i) => (
                      <div key={i} className="border-2 border-black p-10 hover:shadow-[20px_20px_0px_0px_rgba(0,0,0,0.05)] transition-all bg-[#fafafa] rounded-[32px] group">
                        <div className="flex items-center gap-4 mb-8">
                          <span className="text-[10px] font-black uppercase tracking-[0.4em] bg-black text-white px-5 py-2 rounded-full group-hover:bg-neutral-800">{struct.category}</span>
                        </div>
                        <p className="text-2xl font-bold uppercase leading-tight tracking-tight">{struct.details}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="pt-32 border-t-4 border-black animate-in fade-in slide-in-from-bottom-20 duration-1000 delay-600">
                <h4 className="text-sm font-black uppercase tracking-[0.4em] mb-20">Component Registry</h4>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 border-2 border-black rounded-[40px] overflow-hidden">
                  {session.analysis?.modalities.map((m, i) => (
                    <div key={i} className="border-r border-b border-black p-12 flex flex-col gap-8 group hover:bg-black hover:text-white transition-all">
                      <div className="w-12 h-12 border-2 border-current rounded-xl flex items-center justify-center font-mono text-sm font-black opacity-30 group-hover:opacity-100 transition-opacity">
                        0{i + 1}
                      </div>
                      <div className="flex items-center justify-between mt-auto">
                        <span className="text-sm font-black uppercase tracking-widest">{m}</span>
                        <ArrowRight size={18} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-3 transition-all" />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="pt-48 flex flex-col items-center opacity-10">
                <div className="text-[11px] font-black uppercase tracking-[1.5em] mb-6">END OF PROTOCOL</div>
                <div className="w-96 h-[2px] bg-black rounded-full" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisView;
