import { AnalysisResult, LanguagePreference } from "../types";

export const getWelcomeMessage = async (language: LanguagePreference): Promise<string> => {
  try {
    const res = await fetch('/api/gemini/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language })
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    return data.text || "Interface established. Shall we begin mapping your micro-experience?";
  } catch (error) {
    console.error("Welcome Error:", error);
    return "Clinical observer ready. Please describe a specific, singular experience to begin.";
  }
};

export const transcribeAudio = async (audioBlob: Blob, language: LanguagePreference = LanguagePreference.UK): Promise<string> => {
  const reader = new FileReader();
  const base64Promise = new Promise<string>((resolve, reject) => {
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
  });
  reader.readAsDataURL(audioBlob);
  const audioBase64 = await base64Promise;

  const res = await fetch('/api/gemini/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64,
      mimeType: audioBlob.type || 'audio/webm',
      language
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Audio transcription failed with status ${res.status}`);
  }

  const data = await res.json();
  return data.transcript || '';
};

export const analyzeInterview = async (transcriptText: string, language: LanguagePreference): Promise<AnalysisResult> => {
  const res = await fetch('/api/gemini/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcriptText,
      language
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Thematic analysis failed with status ${res.status}`);
  }

  const data: AnalysisResult = await res.json();
  return data;
};

export const synthesizeSpeech = async (text: string, voiceName: string = 'Zephyr'): Promise<string> => {
  const res = await fetch('/api/gemini/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceName })
  });

  if (!res.ok) throw new Error('Speech synthesis failed');
  const data = await res.json();
  return `data:${data.mimeType};base64,${data.audio}`;
};
