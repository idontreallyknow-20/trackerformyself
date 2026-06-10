// Serverless proxy for the nutrition AI calls. Holds your key server-side so it
// never reaches the browser. The app posts an Anthropic-shaped request here; this
// function routes it to whichever provider you have a key for and returns a
// normalized { content: [{ type: "text", text }] } body the app can parse.
//
// Set ONE of these in your host's environment variables:
//   ANTHROPIC_API_KEY   (paid, console.anthropic.com)
//   GEMINI_API_KEY      (FREE, aistudio.google.com/apikey)
//
// Optional: GEMINI_MODEL (defaults to gemini-2.0-flash).

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    body = {};
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  try {
    if (anthropicKey) {
      const out = await callAnthropic(anthropicKey, body);
      res.status(out.status).setHeader("content-type", "application/json").send(out.text);
      return;
    }
    if (geminiKey) {
      const text = await callGemini(geminiKey, body);
      res
        .status(200)
        .setHeader("content-type", "application/json")
        .send(JSON.stringify({ content: [{ type: "text", text }] }));
      return;
    }
    res.status(500).json({
      error: "No API key set. Add ANTHROPIC_API_KEY or GEMINI_API_KEY in your host environment variables.",
    });
  } catch (e) {
    res.status(502).json({ error: "proxy failed", detail: String(e) });
  }
};

async function callAnthropic(key, body) {
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  return { status: upstream.status, text: await upstream.text() };
}

// Translate the Anthropic-shaped request into a Gemini generateContent call,
// then return just the model's text so the app's JSON extractor can read it.
async function callGemini(key, body) {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const parts = [];
  const msg = (body.messages && body.messages[0]) || {};
  const content = msg.content;

  if (typeof content === "string") {
    parts.push({ text: content });
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "text") {
        parts.push({ text: block.text });
      } else if (block.type === "image" && block.source && block.source.data) {
        parts.push({
          inline_data: {
            mime_type: block.source.media_type || "image/jpeg",
            data: block.source.data,
          },
        });
      }
    }
  }

  const payload = {
    contents: [{ role: "user", parts }],
    generationConfig: { maxOutputTokens: body.max_tokens || 1000, temperature: 0.2 },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(key)}`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const detail = await r.text();
    throw new Error("gemini " + r.status + " " + detail.slice(0, 300));
  }

  const data = await r.json();
  const cand = data.candidates && data.candidates[0];
  const outParts = (cand && cand.content && cand.content.parts) || [];
  return outParts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();
}
