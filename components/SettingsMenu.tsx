
import React, { useState, useRef, useEffect } from 'react';
import { Settings, LanguagePreference, VoiceGender, InterviewMode } from '../types';
import { MoreVertical, Languages, Volume2, Shield, Settings2, Coffee, Key, Database, Download, Upload, HeartHandshake, Info, ExternalLink } from 'lucide-react';

interface SettingsMenuProps {
  settings: Settings;
  onUpdate: (settings: Settings) => void;
  onExportEncrypted: () => void;
  onImportEncrypted: (file: File) => void;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({
  settings,
  onUpdate,
  onExportEncrypted,
  onImportEncrypted
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onUpdate({ ...settings, [key]: value });
  };

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600"
      >
        <MoreVertical size={24} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 overflow-hidden">
          <div className="px-4 py-2 border-bottom border-slate-100 mb-1">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Preferences</h3>
          </div>

          <button 
            onClick={() => toggleSetting('language', settings.language === LanguagePreference.UK ? LanguagePreference.US : LanguagePreference.UK)}
            className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
          >
            <Languages size={18} className="text-slate-400" />
            <div className="flex-1">
              <p className="font-medium">Language & Spelling</p>
              <p className="text-xs text-slate-500">{settings.language} English</p>
            </div>
          </button>

          <button 
            onClick={() => toggleSetting('voiceGender', settings.voiceGender === VoiceGender.MALE ? VoiceGender.FEMALE : VoiceGender.MALE)}
            className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
          >
            <Volume2 size={18} className="text-slate-400" />
            <div className="flex-1">
              <p className="font-medium">AI Voice Gender</p>
              <p className="text-xs text-slate-500">{settings.voiceGender}</p>
            </div>
          </button>

          <button 
            onClick={() => toggleSetting('interviewMode', settings.interviewMode === InterviewMode.BEGINNER ? InterviewMode.ADVANCED : InterviewMode.BEGINNER)}
            className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
          >
            <Settings2 size={18} className="text-slate-400" />
            <div className="flex-1">
              <p className="font-medium">Interview Mode</p>
              <p className="text-xs text-slate-500">{settings.interviewMode}</p>
            </div>
          </button>

          <div className="px-4 py-2.5 flex items-center gap-3">
            <Shield size={18} className="text-slate-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-700">Privacy Contract</p>
              <p className="text-xs text-slate-500">Reiterate Consent</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.privacyContract}
                onChange={(e) => toggleSetting('privacyContract', e.target.checked)}
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-black/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black"></div>
            </label>
          </div>

          <div className="px-4 py-2.5 flex items-center gap-3">
            <HeartHandshake size={18} className="text-slate-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-700">Increased Sensitivity Mode</p>
              <p className="text-xs text-slate-500">Slower pacing, gentler probes</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.increasedSensitivityMode}
                onChange={(e) => toggleSetting('increasedSensitivityMode', e.target.checked)}
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-black/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black"></div>
            </label>
          </div>

          <div className="px-4 py-2.5 flex items-center gap-3">
            <Database size={18} className="text-slate-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-700">Persist Session Data</p>
              <p className="text-xs text-slate-500">Stores transcripts locally</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.persistLocalData}
                onChange={(e) => toggleSetting('persistLocalData', e.target.checked)}
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-black/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black"></div>
            </label>
          </div>

          <div className="h-px bg-slate-100 my-1"></div>

          <div className="px-4 py-2.5">
            <div className="flex items-center gap-3 mb-2">
              <Key size={18} className="text-slate-400" />
              <p className="text-sm font-medium text-slate-700">Gemini API Key</p>
            </div>
            <input
              type="password"
              value={settings.apiKey || ''}
              onChange={(e) => toggleSetting('apiKey', e.target.value)}
              placeholder="Enter your API key"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/30"
            />
            <a 
              href="https://aistudio.google.com/apikey" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-neutral-500 hover:text-black mt-1 block transition-colors"
            >
              Get your free API key →
            </a>
          </div>

          <div className="h-px bg-slate-100 my-1"></div>

          <button
            onClick={onExportEncrypted}
            className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
          >
            <Download size={18} className="text-slate-400" />
            <p className="font-medium">Export encrypted archive</p>
          </button>

          <button
            onClick={() => importFileRef.current?.click()}
            className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
          >
            <Upload size={18} className="text-slate-400" />
            <p className="font-medium">Import encrypted archive</p>
          </button>

          <input
            ref={importFileRef}
            type="file"
            accept=".json,.txt,.npvault"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImportEncrypted(file);
              e.currentTarget.value = '';
            }}
          />

          <div className="h-px bg-slate-100 my-1"></div>
          
          <a 
            href="https://buymeacoffee.com/stevebeale" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
          >
            <Coffee size={18} className="text-[#FFDD00]" fill="#FFDD00" />
            <p className="font-medium">Buy me a coffee</p>
          </a>

          <div className="h-px bg-slate-100 my-1"></div>

          <div className="px-4 py-2 mb-1">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">About</h3>
          </div>
          <div className="px-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <Info size={14} className="text-slate-700 flex-shrink-0" />
              <span className="text-sm font-semibold text-slate-700">NeuroPhenomAI</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">
              NeuroPhenomAI is an open-source research tool for conducting and analysing neurophenomenological interviews — a first-person methodology for investigating altered states of consciousness with scientific rigour. Designed for researchers in consciousness studies, psychedelic science, contemplative traditions, and clinical psychotherapy, it provides AI-assisted transcription, structural analysis, and experiential mapping grounded in the frameworks of Francisco Varela, Claire Petitmengin, and the Husserlian phenomenological tradition. The application guides interviewers through the precise evocative process of helping participants revisit and articulate non-ordinary experiences — from psychedelic journeys and meditative states to lucid dreams and flow experiences. Each session produces a comprehensive phenomenological report mapping diachronic structure, experiential categories, and the subtle phenomenal dimensions of consciousness. Whether you are charting the topology of an entheogenic experience, a mystical episode, or the felt textures of deep meditation, NeuroPhenomAI brings methodological precision to the frontier of consciousness research.
            </p>
            <div className="flex flex-col gap-1.5">
              <a
                href="https://www.newpsychonaut.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-600 hover:text-black transition-colors flex items-center gap-1.5 font-medium"
              >
                <ExternalLink size={11} />
                newpsychonaut.com
              </a>
              <a
                href="https://www.instagram.com/newpsychonaut/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-600 hover:text-black transition-colors flex items-center gap-1.5 font-medium"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                @newpsychonaut
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsMenu;
