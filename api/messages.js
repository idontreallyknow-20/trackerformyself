// Vercel serverless function: proxies requests to the Anthropic Messages API,
// adding your API key server-side so it never ships to the browser. The app
// calls this at /api/messages when the direct browser call is blocked (i.e.
// anywhere outside the Claude artifact sandbox).
//
// Set ANTHROPIC_API_KEY in your Vercel project: Settings -> Environment Variables.

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY is not set on the server" });
    return;
  }

  try {
    const body =
      typeof req.body === "string" || req.body == null
        ? req.body || "{}"
        : JSON.stringify(req.body);

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body,
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("content-type", "application/json");
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: "proxy failed", detail: String(e) });
  }
};
