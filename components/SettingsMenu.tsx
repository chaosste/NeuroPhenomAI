
import React, { useState, useRef, useEffect } from 'react';
import { Settings, LanguagePreference, VoiceGender, InterviewMode } from '../types';
import { MoreVertical, Languages, Volume2, Shield, Settings2, Coffee, Key, Database, Download, Upload, HeartHandshake } from 'lucide-react';

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
        </div>
      )}
    </div>
  );
};

export default SettingsMenu;
