import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Type, Modality } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/live' });

// Increase json/urlencoded limits for audio payloads
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Shared server-side Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Welcome message generation endpoint
// Resilient model invocation helper with automatic fallback for high-traffic spikes
async function executeWithModelFallback(params: {
  models: string[];
  contents: any;
  config?: any;
}) {
  let lastError: any = null;
  for (const model of params.models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });
      return response;
    } catch (err: any) {
      console.warn(`Model ${model} encounter:`, err?.status || err?.message);
      lastError = err;
      // If server is busy or 503 or unavailable, fallback to next valid model
      if (err?.status === 503 || err?.status === 429 || err?.message?.includes('high demand') || err?.message?.includes('UNAVAILABLE')) {
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Health check endpoint for Cloud Run and container probes
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    status: 'healthy',
    service: 'neurophenom-ai',
    version: '1.4.0',
    platform: 'google-cloud-run',
    timestamp: new Date().toISOString(),
  });
});

// Welcome message generation endpoint
app.post('/api/gemini/welcome', async (req, res) => {
  try {
    const { language = 'UK' } = req.body;
    const isUK = language === 'UK';
    const prompt = `Generate a concise, professional clinical introduction (2-3 sentences) for a neurophenomenology interview. 
Focus on eliciting the pre-reflective 'how' of a specific lived moment. 
Use ${isUK ? 'UK' : 'US'} spelling and a calm, sophisticated clinical tone.`;

    const response = await executeWithModelFallback({
      models: ['gemini-3.8-flash', 'gemini-3.1-flash-lite'],
      contents: prompt,
    });

    res.json({ text: response.text || "Clinical observer ready. Please describe a specific, singular experience to begin." });
  } catch (error: any) {
    console.error('Welcome Generation Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate welcome prompt' });
  }
});

// High-fidelity audio transcription endpoint using gemini-3.5-transcribe
app.post('/api/gemini/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/webm', language = 'UK' } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: 'Missing audio data' });
    }

    const cleanBase64 = audioBase64.replace(/^data:audio\/[a-z0-9-+.]+;base64,/, '');

    const audioPart = {
      inlineData: {
        mimeType: mimeType.split(';')[0] || 'audio/webm',
        data: cleanBase64,
      },
    };

    const instruction = `Transcribe this audio recording of a micro-phenomenological / neurophenomenology session with high fidelity.
Maintain ${language === 'UK' ? 'UK' : 'US'} spelling conventions.
Preserve exact wording, pauses, and descriptions of physical, affective, and sensory moments.
If dialogue between interviewer and participant is present, format speaker turns clearly as:
Interviewer: <statement>
Interviewee: <statement>
Otherwise, transcribe the participant's narrative accurately.`;

    const response = await executeWithModelFallback({
      models: ['gemini-3.5-transcribe', 'gemini-3.1-flash-lite'],
      contents: { parts: [audioPart, { text: instruction }] },
    });

    const transcriptText = response.text || '';
    res.json({ transcript: transcriptText });
  } catch (error: any) {
    console.error('Audio Transcription Error:', error);
    res.status(500).json({ error: error.message || 'Transcription failed' });
  }
});

// Neurophenomenological Thematic & Diachronic Analysis using gemini-3.8-flash
app.post('/api/gemini/analyze', async (req, res) => {
  try {
    const { transcriptText, language = 'UK' } = req.body;
    if (!transcriptText || typeof transcriptText !== 'string' || !transcriptText.trim()) {
      return res.status(400).json({ error: 'Valid transcriptText is required' });
    }

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        summary: { 
          type: Type.STRING, 
          description: 'A crisp, high-level phenomenological synthesis of the core lived moment' 
        },
        takeaways: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: '3 to 5 key structural observations regarding the pre-reflective experience'
        },
        modalities: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: 'Identified sensory & somatic modalities (e.g. Visual-Kinesthetic, Proprioceptive, Auditory Internal, Visceral, Tactile)'
        },
        phasesCount: { 
          type: Type.INTEGER,
          description: 'Total number of distinct diachronic temporal phases'
        },
        diachronicStructure: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              phaseName: { type: Type.STRING, description: 'Phase title, e.g. Phase 1: Inception / Trigger' },
              description: { type: Type.STRING, description: 'Granular unfolding of this temporal segment' },
              startTime: { type: Type.STRING, description: 'Approximate or relative timestamp, e.g. 0:00' }
            },
            required: ['phaseName', 'description', 'startTime'],
          },
        },
        synchronicStructure: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING, description: 'Structural dimension (e.g. Bodily Felt-Sense, Internal Horizon, Attentional Dynamic)' },
              details: { type: Type.STRING, description: 'Detailed qualitative configuration during the moment' }
            },
            required: ['category', 'details'],
          },
        },
        transcript: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              speaker: { type: Type.STRING, enum: ['Interviewer', 'Interviewee', 'AI'] },
              text: { type: Type.STRING },
              startTime: { type: Type.NUMBER, description: 'Time in seconds' }
            },
            required: ['speaker', 'text'],
          },
        },
      },
      required: [
        'summary',
        'takeaways',
        'modalities',
        'phasesCount',
        'diachronicStructure',
        'synchronicStructure',
        'transcript',
      ],
    };

    const prompt = `MANDATORY INSTRUCTION:
Perform a deep Micro-Phenomenological and Neurophenomenological thematic analysis of the following interview data.
Language & spelling: ${language === 'UK' ? 'UK English' : 'US English'}.

1. DIARIZATION: Segment into ordered dialog turns with speaker ('Interviewer' / 'AI' or 'Interviewee'). If timestamps are known or estimated, assign startTime (seconds).
2. DIACHRONIC SEQUENCE: Map temporal unfolding into discrete chronological phases (how the experience evolved in time).
3. SYNCHRONIC DYNAMICS: Identify structural categories at frozen moments (attentional focus, felt sense, cognitive shifts, bodily awareness).
4. MODALITIES: List all sensory and somatic modalities actively engaged.
5. SUMMARY: Provide a definitive title/synthesis of the lived moment.

RAW INTERVIEW DATA:
${transcriptText}`;

    const response = await executeWithModelFallback({
      models: ['gemini-3.8-flash', 'gemini-3.1-flash-lite'],
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema,
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error('Analysis produced an empty result');
    }

    const parsed = JSON.parse(resultText.trim());
    res.json(parsed);
  } catch (error: any) {
    console.error('Thematic Analysis Error:', error);
    res.status(500).json({ error: error.message || 'Analysis mapping failed' });
  }
});

// Text-to-Speech synthesis using gemini-3.8-flash-lite-tts
app.post('/api/gemini/tts', async (req, res) => {
  try {
    const { text, voiceName = 'Zephyr' } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: text.slice(0, 500),
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error('No audio returned from TTS model');

    res.json({ audio: base64Audio, mimeType: 'audio/wav' });
  } catch (error: any) {
    console.error('TTS Error:', error);
    res.status(500).json({ error: error.message || 'TTS generation failed' });
  }
});

// WebSocket for conversational voice performance via Gemini Live API (gemini-3.8-live)
wss.on('connection', async (clientWs, request) => {
  console.log('Client connected to Live Voice WebSocket');

  let liveSession: any = null;
  let isClosing = false;

  clientWs.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'init') {
        const { language = 'UK', voiceGender = 'FEMALE', interviewMode = 'BEGINNER', privacyContract = true } = msg;

        const isUK = language === 'UK';
        const isMale = voiceGender === 'MALE';
        const voiceName = isUK ? (isMale ? 'Fenrir' : 'Zephyr') : (isMale ? 'Puck' : 'Kore');

        const systemInstruction = `You are a world-class Neurophenomenology AI Interviewer conducting a Micro-phenomenological Interview.
Spelling: ${isUK ? 'UK spelling' : 'US spelling'}.
Persona: Professional, attentive clinical researcher. Speak clearly, concisely, and calmly.
Goal: Guide participant to evoke a specific, singular experience and describe the pre-reflective 'how' (sensory, temporal, somatic dynamics) rather than abstract theoretical explanations.
Mode: ${interviewMode}. Privacy contract: ${privacyContract ? 'Active' : 'Standard'}.
Wait for the participant to respond. Keep prompts brief and focused on direct sensory qualities.`;

        try {
          liveSession = await ai.live.connect({
            model: 'gemini-3.8-live',
            config: {
              responseModalities: [Modality.AUDIO],
              outputAudioTranscription: {},
              inputAudioTranscription: {},
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
              systemInstruction,
            },
            callbacks: {
              onopen: () => {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({ type: 'ready' }));
                }
              },
              onmessage: (serverMessage: any) => {
                if (clientWs.readyState !== WebSocket.OPEN) return;

                // Handle audio chunk from model
                const audio = serverMessage.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (audio) {
                  clientWs.send(JSON.stringify({ type: 'audio', audio }));
                }

                // Handle transcriptions
                if (serverMessage.serverContent?.outputTranscription?.text) {
                  clientWs.send(JSON.stringify({
                    type: 'transcription',
                    speaker: 'AI',
                    text: serverMessage.serverContent.outputTranscription.text,
                  }));
                }
                if (serverMessage.serverContent?.inputTranscription?.text) {
                  clientWs.send(JSON.stringify({
                    type: 'transcription',
                    speaker: 'Interviewee',
                    text: serverMessage.serverContent.inputTranscription.text,
                  }));
                }

                if (serverMessage.serverContent?.interrupted) {
                  clientWs.send(JSON.stringify({ type: 'interrupted' }));
                }
                if (serverMessage.serverContent?.turnComplete) {
                  clientWs.send(JSON.stringify({ type: 'turnComplete' }));
                }
              },
              onerror: (err) => {
                console.error('Gemini Live session error:', err);
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({ type: 'error', error: err?.message || 'Live session error' }));
                }
              },
              onclose: () => {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({ type: 'closed' }));
                }
              },
            },
          });
        } catch (connErr: any) {
          console.error('Failed to connect to Gemini Live:', connErr);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'error', error: connErr.message || 'Live API connection error' }));
          }
        }
      } else if (msg.type === 'audio' && msg.audio && liveSession) {
        liveSession.sendRealtimeInput({
          audio: {
            data: msg.audio,
            mimeType: 'audio/pcm;rate=16000',
          },
        });
      } else if (msg.type === 'text' && msg.text && liveSession) {
        liveSession.sendRealtimeInput({
          text: msg.text,
        });
      }
    } catch (e) {
      console.error('WebSocket message parsing error:', e);
    }
  });

  clientWs.on('close', () => {
    isClosing = true;
    if (liveSession) {
      try {
        liveSession.close();
      } catch (e) {}
    }
  });

  clientWs.on('error', (err) => {
    console.error('WebSocket client error:', err);
    if (liveSession) {
      try {
        liveSession.close();
      } catch (e) {}
    }
  });
});

// Dev vs Prod Vite middleware
async function setupVite() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`NeuroPhenom AI running on http://0.0.0.0:${PORT}`);
  });
}

setupVite().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
