import express from "express";
import rateLimit from "express-rate-limit";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
const distPath = path.join(__dirname, "dist");
const publicPath = path.join(__dirname, "server", "public");
const jsonParser = express.json({ limit: "50mb" });
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
const staticFallbackRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.STATIC_RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please retry shortly." }
});
const proxyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PROXY_RATE_LIMIT_MAX || 100),
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again after 15 minutes"
});

const foundryEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const foundryApiKey = process.env.AZURE_OPENAI_API_KEY;
const foundryDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;
const foundryApiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
const showcaseMode = process.env.SHOWCASE_MODE === "true";
const externalApiBaseUrl = "https://generativelanguage.googleapis.com";
const externalWsBaseUrl = "wss://generativelanguage.googleapis.com";
const canonicalSpecPath = path.join(
  __dirname,
  "docs",
  "knowledge",
  "core",
  "NP_CANONICAL_SPEC.md"
);

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
    service: "neurophenomai",
    foundryConfigured: isFoundryConfigured(),
    showcaseMode: Boolean(showcaseMode && geminiApiKey),
    geminiProxy: Boolean(geminiApiKey)
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

/** Gemini HTTP proxy (Cloud Run showcase). Client uses baseUrl=/api-proxy. */
app.use("/api-proxy", proxyLimiter, express.raw({ type: "*/*", limit: "50mb" }));
app.use("/api-proxy", async (req, res, next) => {
  if (req.headers.upgrade && String(req.headers.upgrade).toLowerCase() === "websocket") {
    return next();
  }
  if (!geminiApiKey) {
    res.status(503).json({ error: "Gemini proxy unavailable (GEMINI_API_KEY not set)." });
    return;
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Goog-Api-Key"
    );
    res.sendStatus(200);
    return;
  }

  try {
    const targetPath = req.url.startsWith("/") ? req.url.slice(1) : req.url;
    const apiUrl = `${externalApiBaseUrl}/${targetPath}`;
    const headers = {
      "X-Goog-Api-Key": geminiApiKey,
      Accept: req.headers.accept || "*/*"
    };
    if (req.headers["content-type"] && ["POST", "PUT", "PATCH"].includes(req.method)) {
      headers["Content-Type"] = req.headers["content-type"];
    }

    const upstream = await fetch(apiUrl, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!["transfer-encoding", "connection"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (error) {
    console.error("Gemini HTTP proxy error:", error);
    if (!res.headersSent) {
      res.status(502).json({
        error: "Proxy error",
        message: error instanceof Error ? error.message : "unknown"
      });
    }
  }
});

app.get("/service-worker.js", (_req, res) => {
  res.sendFile(path.join(publicPath, "service-worker.js"));
});
app.use("/public", express.static(publicPath));

const injectShowcaseScripts = (html) => {
  if (!showcaseMode || !geminiApiKey) return html;
  const tags = `<script src="/public/websocket-interceptor.js" defer></script>
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}
</script>`;
  if (html.includes("<head>")) {
    return html.replace("<head>", `<head>${tags}`);
  }
  return `${tags}${html}`;
};

app.get("/", (_req, res) => {
  const indexPath = path.join(distPath, "index.html");
  fs.readFile(indexPath, "utf8", (err, html) => {
    if (err) {
      res.status(500).send("Build missing. Run npm run build.");
      return;
    }
    res.type("html").send(injectShowcaseScripts(html));
  });
});

app.use(express.static(distPath));

app.get(/.*/, staticFallbackRateLimiter, (req, res) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/api-proxy")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const indexPath = path.join(distPath, "index.html");
  fs.readFile(indexPath, "utf8", (err, html) => {
    if (err) {
      res.status(500).send("Build missing.");
      return;
    }
    res.type("html").send(injectShowcaseScripts(html));
  });
});

const port = Number(process.env.PORT || 8080);
const server = http.createServer(app);

if (geminiApiKey) {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host}`);
    const pathname = requestUrl.pathname;
    if (!pathname.startsWith("/api-proxy/")) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (clientWs) => {
      const targetPathSegment = pathname.slice("/api-proxy".length);
      const clientQuery = new URLSearchParams(requestUrl.search);
      clientQuery.set("key", geminiApiKey);
      const targetGeminiWsUrl = `${externalWsBaseUrl}${targetPathSegment}?${clientQuery.toString()}`;
      const geminiWs = new WebSocket(targetGeminiWsUrl, {
        protocol: request.headers["sec-websocket-protocol"]
      });
      const messageQueue = [];

      geminiWs.on("open", () => {
        while (messageQueue.length > 0) {
          const message = messageQueue.shift();
          if (geminiWs.readyState === WebSocket.OPEN) geminiWs.send(message);
        }
      });
      geminiWs.on("message", (message) => {
        if (clientWs.readyState === WebSocket.OPEN) clientWs.send(message);
      });
      geminiWs.on("close", (code, reason) => {
        if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
          clientWs.close(code, reason.toString());
        }
      });
      geminiWs.on("error", () => {
        if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
          clientWs.close(1011, "Upstream WebSocket error");
        }
      });
      clientWs.on("message", (message) => {
        if (geminiWs.readyState === WebSocket.OPEN) geminiWs.send(message);
        else if (geminiWs.readyState === WebSocket.CONNECTING) messageQueue.push(message);
      });
      clientWs.on("close", (code, reason) => {
        if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
          geminiWs.close(code, reason.toString());
        }
      });
      clientWs.on("error", () => {
        if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
          geminiWs.close(1011, "Client WebSocket error");
        }
      });
    });
  });
  console.log("Gemini Live WebSocket proxy enabled on /api-proxy/**");
} else {
  console.warn("GEMINI_API_KEY not set — showcase proxy disabled (Azure/user-key mode).");
}

server.listen(port, "0.0.0.0", () => {
  console.log(`Serving dist on port ${port}`);
});
