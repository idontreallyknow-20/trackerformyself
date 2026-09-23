// Serverless proxy for the nutrition AI calls. Holds your key server-side so it
// never reaches the browser. The app posts an Anthropic-shaped request here; this
// function routes it to whichever provider you have a key for and returns a
// normalized { content: [{ type: "text", text }] } body the app can parse.
//
// Set ONE of these in your host's environment variables:
//   ANTHROPIC_API_KEY   (paid, console.anthropic.com)
//   GEMINI_API_KEY      (FREE, aistudio.google.com/apikey)
//
// Optional: ANTHROPIC_MODEL (defaults to claude-sonnet-5) and GEMINI_MODEL
// (defaults to gemini-2.5-flash, falling back to gemini-flash-latest).
//
// The model, token budget and tools are fixed here, not taken from the request,
// so the endpoint can't be used as a general purpose free AI proxy.

const MAX_TOKENS = 1500;
const GEMINI_FALLBACKS = ["gemini-2.5-flash", "gemini-flash-latest"];

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    res.status(405).json({ error: "Use POST" });
    return;
  }

  // Browsers always send Origin on a cross-site POST; refuse other sites.
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (origin && host) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {}
    if (originHost !== host) {
      res.status(403).json({ error: "Cross-origin requests are not allowed" });
      return;
    }
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    body = {};
  }

  const msg = sanitizeMessage(body);
  if (!msg) {
    res.status(400).json({ error: "Expected one user message with text and an optional image" });
    return;
  }
  const wantsSearch = Array.isArray(body.tools) && body.tools.some((t) => t && t.name === "web_search");

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  try {
    if (anthropicKey) {
      const out = await callAnthropic(anthropicKey, msg, wantsSearch);
      res.status(out.status).setHeader("content-type", "application/json").send(out.text);
      return;
    }
    if (geminiKey) {
      const text = await callGemini(geminiKey, msg, wantsSearch);
      res.status(200).json({ content: [{ type: "text", text }] });
      return;
    }
    res.status(500).json({
      error: "No API key set. Add ANTHROPIC_API_KEY or GEMINI_API_KEY in your host environment variables.",
    });
  } catch (e) {
    res.status(502).json({ error: "AI request failed", detail: String(e && e.message ? e.message : e) });
  }
};

// Keep only what the app sends: a single user message made of text blocks and
// at most one base64 JPEG/PNG/WebP image.
function sanitizeMessage(body) {
  const m = Array.isArray(body.messages) && body.messages[0];
  if (!m || m.role !== "user") return null;
  if (typeof m.content === "string") {
    return m.content.trim() ? { role: "user", content: m.content.slice(0, 4000) } : null;
  }
  if (!Array.isArray(m.content)) return null;
  const blocks = [];
  let images = 0;
  for (const b of m.content) {
    if (b && b.type === "text" && typeof b.text === "string") {
      blocks.push({ type: "text", text: b.text.slice(0, 4000) });
    } else if (
      b &&
      b.type === "image" &&
      images === 0 &&
      b.source &&
      b.source.type === "base64" &&
      /^image\/(jpeg|png|webp)$/.test(b.source.media_type || "") &&
      typeof b.source.data === "string"
    ) {
      images++;
      blocks.push({ type: "image", source: { type: "base64", media_type: b.source.media_type, data: b.source.data } });
    }
  }
  return blocks.some((b) => b.type === "text") ? { role: "user", content: blocks } : null;
}

async function callAnthropic(key, msg, wantsSearch) {
  const payload = {
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: MAX_TOKENS,
    messages: [msg],
  };
  if (wantsSearch) payload.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });
  return { status: upstream.status, text: await upstream.text() };
}

// Translate the Anthropic-shaped message into a Gemini generateContent call,
// then return just the model's text so the app's JSON extractor can read it.
async function callGemini(key, msg, wantsSearch) {
  const parts = [];
  if (typeof msg.content === "string") {
    parts.push({ text: msg.content });
  } else {
    for (const block of msg.content) {
      if (block.type === "text") parts.push({ text: block.text });
      else if (block.type === "image") {
        parts.push({ inline_data: { mime_type: block.source.media_type, data: block.source.data } });
      }
    }
  }

  const models = [process.env.GEMINI_MODEL, ...GEMINI_FALLBACKS].filter(
    (m, i, all) => m && all.indexOf(m) === i
  );

  let lastErr;
  for (const model of models) {
    // Search grounding helps branded lookups; if it's refused, retry without it.
    const attempts = wantsSearch ? [true, false] : [false];
    for (const grounded of attempts) {
      const r = await geminiGenerate(key, model, parts, grounded);
      if (r.ok) return r.text;
      lastErr = new Error(`gemini ${model} ${r.status} ${r.detail.slice(0, 300)}`);
      if (r.status === 404) break; // model not available, try the next one
      if (!grounded) throw lastErr;
    }
  }
  throw lastErr || new Error("no Gemini model available");
}

async function geminiGenerate(key, model, parts, grounded) {
  // Thinking models spend output tokens on reasoning first, so leave headroom.
  const payload = {
    contents: [{ role: "user", parts }],
    generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
  };
  if (grounded) payload.tools = [{ google_search: {} }];
  else payload.generationConfig.responseMimeType = "application/json";

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(payload),
    }
  );
  if (!r.ok) return { ok: false, status: r.status, detail: await r.text() };

  const data = await r.json();
  const cand = data.candidates && data.candidates[0];
  const outParts = (cand && cand.content && cand.content.parts) || [];
  const text = outParts
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
  if (!text) {
    const reason = (cand && cand.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || "empty";
    return { ok: false, status: 502, detail: `no text returned (${reason})` };
  }
  return { ok: true, text };
}
