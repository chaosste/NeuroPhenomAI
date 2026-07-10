import { LanguagePreference, VoiceGender } from '../types';

/** Gemini Developer API Live native-audio model (Dec 2025 preview). */
export const LIVE_NATIVE_AUDIO_MODEL =
  'gemini-2.5-flash-native-audio-preview-12-2025';

/** Multimodal model for offline verbatim transcription. */
export const OFFLINE_TRANSCRIBE_MODEL = 'gemini-2.5-flash';

export const languageCodeForPreference = (
  language: LanguagePreference
): string => (language === LanguagePreference.UK ? 'en-GB' : 'en-US');

export interface GeminiVoiceOption {
  name: string;
  label: string;
  gender: VoiceGender;
}

/** Curated Gemini Live prebuilt voices (subset of the 30 HD voices). */
export const GEMINI_VOICE_OPTIONS: GeminiVoiceOption[] = [
  { name: 'Puck', label: 'Puck — Upbeat', gender: VoiceGender.MALE },
  { name: 'Fenrir', label: 'Fenrir — Excitable', gender: VoiceGender.MALE },
  { name: 'Charon', label: 'Charon — Informative', gender: VoiceGender.MALE },
  { name: 'Orus', label: 'Orus — Firm', gender: VoiceGender.MALE },
  { name: 'Kore', label: 'Kore — Firm', gender: VoiceGender.FEMALE },
  { name: 'Zephyr', label: 'Zephyr — Bright', gender: VoiceGender.FEMALE },
  { name: 'Aoede', label: 'Aoede — Breezy', gender: VoiceGender.FEMALE },
  { name: 'Leda', label: 'Leda — Youthful', gender: VoiceGender.FEMALE },
  { name: 'Autonoe', label: 'Autonoe — Bright', gender: VoiceGender.FEMALE },
  { name: 'Sulafat', label: 'Sulafat — Warm', gender: VoiceGender.FEMALE }
];

export const resolveVoiceName = (opts: {
  voiceName?: string;
  language: LanguagePreference;
  voiceGender: VoiceGender;
}): string => {
  const explicit = opts.voiceName?.trim();
  if (explicit && GEMINI_VOICE_OPTIONS.some((v) => v.name === explicit)) {
    return explicit;
  }
  if (opts.language === LanguagePreference.UK) {
    return opts.voiceGender === VoiceGender.MALE ? 'Fenrir' : 'Zephyr';
  }
  return opts.voiceGender === VoiceGender.MALE ? 'Puck' : 'Kore';
};

export const buildLiveTranscriptionConfig = (language: LanguagePreference) => ({
  languageHints: {
    languageCodes: [languageCodeForPreference(language)]
  }
});

export const buildLiveSpeechConfig = (opts: {
  voiceName?: string;
  language: LanguagePreference;
  voiceGender: VoiceGender;
}) => ({
  languageCode: languageCodeForPreference(opts.language),
  voiceConfig: {
    prebuiltVoiceConfig: {
      voiceName: resolveVoiceName(opts)
    }
  }
});
