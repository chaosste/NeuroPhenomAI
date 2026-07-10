
import {
  GoogleGenAI,
  Type,
  createPartFromBase64,
  createPartFromText,
  createUserContent
} from "@google/genai";
import { AnalysisResult, LanguagePreference } from "../types";
import { OFFLINE_TRANSCRIBE_MODEL } from "./speechConfig";

const getApiKey = (): string => {
  try {
    const fromSession = sessionStorage.getItem('neuro_phenom_api_key')?.trim();
    if (fromSession) return fromSession;
  } catch {
    /* private mode */
  }
  const savedSettings = localStorage.getItem('neuro_phenom_settings');
  if (savedSettings) {
    try {
      const parsed = JSON.parse(savedSettings);
      if (typeof parsed?.apiKey === 'string' && parsed.apiKey.trim()) return parsed.apiKey.trim();
    } catch {
      /* ignore */
    }
  }
  return '';
};

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unexpected FileReader result'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });

/** Offline pass: send the captured clip to Gemini as inline audio for a verbatim transcript. */
export const transcribeInterviewAudio = async (audioBlob: Blob): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Please add your Gemini API key in Settings");
  }
  const mimeType =
    audioBlob.type && audioBlob.type !== 'application/octet-stream'
      ? audioBlob.type
      : 'audio/webm';
  const ai = new GoogleGenAI({ apiKey });
  const audioBase64 = await blobToBase64(audioBlob);
  const response = await ai.models.generateContent({
    model: OFFLINE_TRANSCRIBE_MODEL,
    contents: createUserContent([
      createPartFromText(
        'Transcribe this clinical neurophenomenology interview audio verbatim. ' +
          'Preserve filler words and hesitations. Do not summarize, translate, or add commentary. ' +
          'If multiple speakers are clearly distinct, prefix lines with "Interviewer:" or "Interviewee:". ' +
          'Output only the transcript.'
      ),
      createPartFromBase64(audioBase64, mimeType)
    ])
  });
  return (response.text ?? '').trim();
};

export const getWelcomeMessage = async (language: LanguagePreference): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return "Please add your Gemini API key in Settings to begin.";
  }
  
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Generate a concise, professional clinical introduction for a neurophenomenology interview. 
  Focus on the 'how' of micro-experience. 
  Use ${language === LanguagePreference.UK ? 'UK' : 'US'} spelling and a sophisticated tone.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });
    return response.text || "Interface established. Shall we begin mapping your micro-experience?";
  } catch (error) {
    console.error("Welcome Error:", error);
    return "Clinical observer ready. Please describe a specific, singular experience to begin.";
  }
};

export const analyzeInterview = async (transcriptText: string, language: LanguagePreference): Promise<AnalysisResult> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Please add your Gemini API key in Settings");
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING },
      takeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
      modalities: { type: Type.ARRAY, items: { type: Type.STRING } },
      phasesCount: { type: Type.INTEGER },
      diachronicStructure: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            phaseName: { type: Type.STRING },
            description: { type: Type.STRING },
            startTime: { type: Type.STRING }
          },
          required: ["phaseName", "description", "startTime"]
        }
      },
      synchronicStructure: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            details: { type: Type.STRING }
          },
          required: ["category", "details"]
        }
      },
      transcript: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            speaker: { type: Type.STRING, enum: ["Interviewer", "Interviewee", "AI"] },
            text: { type: Type.STRING },
            startTime: { type: Type.NUMBER }
          },
          required: ["speaker", "text"]
        }
      }
    },
    required: ["summary", "takeaways", "modalities", "phasesCount", "diachronicStructure", "synchronicStructure", "transcript"]
  };

  const prompt = `MANDATORY INSTRUCTION:
  Analyze the provided raw data as a neurophenomenology interview.
  1. DIARIZATION: Extract turns between the 'Interviewer' (AI) and 'Interviewee' (User). 
  2. PHENOMENOLOGY: Map the diachronic temporal unfolding and synchronic structural features.
  3. REGISTRY: Identify the specific sensory modalities (visual, auditory, tactile, etc.).
  
  DATA FOR ANALYSIS:
  ${transcriptText}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema,
      }
    });

    const resultText = response.text;
    if (!resultText) throw new Error("MAPPING_PROTOCOL_FAILURE_EMPTY");
    return JSON.parse(resultText.trim()) as AnalysisResult;
  } catch (error) {
    console.error("Critical Analysis Error:", error);
    throw error;
  }
};
