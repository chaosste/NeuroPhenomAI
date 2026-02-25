import express from "express";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
const distPath = path.join(__dirname, "dist");
const jsonParser = express.json({ limit: "2mb" });
const welcomeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.WELCOME_RATE_LIMIT_MAX || 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many welcome requests. Please retry shortly." }
});
const analysisRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ANALYZE_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many analysis requests. Please retry shortly." }
});

const foundryEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const foundryApiKey = process.env.AZURE_OPENAI_API_KEY;
const foundryDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;
const foundryApiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
const canonicalSpecPath = path.join(__dirname, "docs", "knowledge", "core", "NP_CANONICAL_SPEC.md");

const fallbackCanonicalPolicy = `
- Keep interview targets singular and concrete.
- Prioritize experiential process (how) over theory (why).
- Preserve participant agency and reversible consent.
- Use diachronic and synchronic analysis structure.
- Avoid speculation when transcript evidence is sparse.
`.trim();

const canonicalPolicy = (() => {
  try {
    const value = fs.readFileSync(canonicalSpecPath, "utf8").trim();
    return value.length > 0 ? value : fallbackCanonicalPolicy;
  } catch {
    return fallbackCanonicalPolicy;
  }
})();

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    takeaways: { type: "array", items: { type: "string" } },
    modalities: { type: "array", items: { type: "string" } },
    phasesCount: { type: "integer" },
    codebookSuggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          rationale: { type: "string" },
          exemplarQuote: { type: "string" }
        },
        required: ["label", "rationale", "exemplarQuote"]
      }
    },
    diachronicStructure: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          phaseName: { type: "string" },
          description: { type: "string" },
          startTime: { type: "string" }
        },
        required: ["phaseName", "description", "startTime"]
      }
    },
    synchronicStructure: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: { type: "string" },
          details: { type: "string" }
        },
        required: ["category", "details"]
      }
    },
    transcript: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          speaker: { type: "string", enum: ["Interviewer", "Interviewee", "AI"] },
          text: { type: "string" },
          startTime: { type: "number" }
        },
        required: ["speaker", "text"]
      }
    }
  },
  required: [
    "summary",
    "takeaways",
    "modalities",
    "phasesCount",
    "diachronicStructure",
    "synchronicStructure",
    "transcript"
  ]
};

const isFoundryConfigured = () =>
  Boolean(foundryEndpoint && foundryApiKey && foundryDeployment);

const normalizeLanguage = (language) => (language === "UK" ? "UK" : "US");

const buildAnalysisPrompt = (transcriptText, language) => {
  const locale = normalizeLanguage(language);
  return `Analyze the interview transcript as a neurophenomenology session. Use ${locale} English.

METHOD CONSTRAINTS (MICRO-PHENOMENOLOGY):
1. Prioritize experiential process ("how") over theory, interpretation, or causal explanation ("why").
2. Distinguish concrete evocation from abstraction. Treat vague labels as lower-quality evidence.
3. Preserve participant agency and privacy-sensitive framing.
4. Track both:
   - Diachronic unfolding (how experience transforms over time)
   - Synchronic structure (how dimensions co-occur within a given moment)

OUTPUT REQUIREMENTS:
1. DIARIZATION: Label turns only as Interviewer, Interviewee, or AI.
2. SUMMARY: High-fidelity synthesis of lived-process dynamics.
3. TAKEAWAYS: Research-relevant points grounded in transcript evidence.
4. MODALITIES: Sensory/affective/cognitive/interoceptive modalities explicitly present in data.
5. CODEBOOK SUGGESTIONS: 4-8 coding labels, each with rationale + one exemplar quote.
6. DIACHRONIC STRUCTURE: Sequential experiential phases with concise descriptions.
7. SYNCHRONIC STRUCTURE: Structural dimensions active within moments (attention, embodiment, agency, temporality, affective tone, etc.).

QUALITY BAR:
- Do not invent details absent from transcript.
- Keep terms operational and coder-friendly.
- If evidence is sparse, describe uncertainty conservatively.

CANONICAL POLICY BASELINE:
${canonicalPolicy}

INPUT TRANSCRIPT:
${transcriptText}`;
};

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getFirstMessageContent = (data) => {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("");
  }
  return "";
};

const callFoundryChatCompletions = async (messages, useStructuredOutput) => {
  const endpoint = foundryEndpoint.replace(/\/+$/, "");
  const url = `${endpoint}/openai/deployments/${foundryDeployment}/chat/completions?api-version=${foundryApiVersion}`;

  const body = {
    messages,
    temperature: 0.2,
    max_tokens: 2000
  };

  if (useStructuredOutput) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "NeuroPhenomAnalysis",
        strict: true,
        schema: analysisSchema
      }
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": foundryApiKey
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage =
      data?.error?.message || `Foundry request failed (${response.status})`;
    throw new Error(errorMessage);
  }
  return data;
};

app.get("/api/health", (_req, res) => {
  res.set("Cache-Control", "no-store, max-age=0");
  res.json({
    ok: true,
    foundryConfigured: isFoundryConfigured()
  });
});

app.post("/api/welcome", welcomeRateLimiter, jsonParser, async (req, res) => {
  if (!isFoundryConfigured()) {
    res.status(500).json({
      error:
        "Foundry is not configured. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT."
    });
    return;
  }

  const language = normalizeLanguage(req.body?.language);
  const messages = [
    {
      role: "system",
      content:
        "You are a clinical neurophenomenology assistant. Respond in one short paragraph."
    },
    {
      role: "user",
      content: `Write a concise welcome introduction for a neurophenomenology interview in ${language} English.`
    }
  ];

  try {
    const data = await callFoundryChatCompletions(messages, false);
    res.set("Cache-Control", "no-store, max-age=0");
    res.json({
      text:
        getFirstMessageContent(data) ||
        "Interface established. Shall we begin mapping your micro-experience?"
    });
  } catch (error) {
    res.status(502).json({
      error:
        error instanceof Error ? error.message : "Failed to generate welcome message"
    });
  }
});

app.post("/api/analyze", analysisRateLimiter, jsonParser, async (req, res) => {
  if (!isFoundryConfigured()) {
    res.status(500).json({
      error:
        "Foundry is not configured. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT."
    });
    return;
  }

  const transcriptText = req.body?.transcriptText;
  const language = normalizeLanguage(req.body?.language);

  if (!transcriptText || typeof transcriptText !== "string") {
    res.status(400).json({ error: "transcriptText is required." });
    return;
  }

  const messages = [
    {
      role: "system",
      content:
        "You are a neurophenomenology analyst. Return only JSON with no markdown."
    },
    {
      role: "user",
      content: buildAnalysisPrompt(transcriptText, language)
    }
  ];

  try {
    let data;
    try {
      data = await callFoundryChatCompletions(messages, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.toLowerCase().includes("response_format")) {
        throw error;
      }
      data = await callFoundryChatCompletions(messages, false);
    }

    const content = getFirstMessageContent(data);
    const parsed = safeJsonParse(content);

    if (!parsed || typeof parsed !== "object") {
      res.status(502).json({ error: "Model returned invalid JSON." });
      return;
    }

    res.set("Cache-Control", "no-store, max-age=0");
    res.json(parsed);
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Analysis request failed"
    });
  }
});

app.use(express.static(distPath));

// SPA fallback (client-side routing) - Express 5 compatible
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const port = process.env.PORT || 8080;
app.listen(port, "0.0.0.0", () => {
  console.log(`Serving dist on port ${port}`);
});
