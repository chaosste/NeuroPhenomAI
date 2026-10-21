
import React, { useState, useRef, useEffect } from 'react';
import { Settings, LanguagePreference, VoiceGender, InterviewMode } from '../types';
import { MoreVertical, Languages, Volume2, Shield, Settings2, Coffee } from 'lucide-react';

interface SettingsMenuProps {
  settings: Settings;
  onUpdate: (settings: Settings) => void;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({ settings, onUpdate }) => {
  const [isOpen, setIsOpen] = useState(false);
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
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

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
