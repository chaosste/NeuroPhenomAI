/**
 * Shared GoogleGenAI client factory.
 * In Cloud Run showcase mode, HTTP goes through same-origin /api-proxy
 * (server injects the real Gemini key). Live WebSockets are rewritten by
 * public/websocket-interceptor.js.
 */
import { GoogleGenAI } from '@google/genai';

const SHOWCASE = import.meta.env.VITE_SHOWCASE_MODE === 'true';

/** Placeholder key for showcase; the server proxy replaces it with GEMINI_API_KEY. */
export const SHOWCASE_API_KEY = 'showcase';

export const isShowcaseMode = (): boolean => SHOWCASE;

export const createGeminiClient = (apiKey?: string): GoogleGenAI => {
  if (SHOWCASE) {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080';
    return new GoogleGenAI({
      apiKey: SHOWCASE_API_KEY,
      httpOptions: {
        baseUrl: `${origin}/api-proxy`
      }
    });
  }

  const key = apiKey?.trim() || '';
  if (!key) {
    throw new Error('Please add your Gemini API key in Settings');
  }
  return new GoogleGenAI({ apiKey: key });
};

export const resolveClientApiKey = (apiKey?: string): string => {
  if (SHOWCASE) return SHOWCASE_API_KEY;
  return apiKey?.trim() || '';
};
