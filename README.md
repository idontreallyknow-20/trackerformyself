# Bulk Tracker

A calorie and bulking tracker that treats the daily goal as a floor to hit, not a
ceiling. Log meals from a photo, a name lookup or by hand, and track macros and
micros, bodyweight, a creatine streak and a 14 day calorie history. It installs to
your home screen as a PWA and works offline. Your log stays on your device.

Live: [trackerformyself.vercel.app](https://trackerformyself.vercel.app)

## Run it locally

```bash
npm install
npm run build        # bundles src/ into docs/
npx serve docs       # or any static server
```

The photo estimate and name lookup call `/api/messages`, a Vercel serverless
function, so they only work on Vercel (or `vercel dev`). Everything else runs from
any static host, including GitHub Pages pointed at the `docs/` folder.

## AI key

Set ONE of these in your Vercel project's environment variables:

- `GEMINI_API_KEY`: free, from [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- `ANTHROPIC_API_KEY`: paid, from [console.anthropic.com](https://console.anthropic.com)

Optional: `GEMINI_MODEL` or `ANTHROPIC_MODEL` to override the default model. The key
never reaches the browser, and the function fixes the model, token budget and tools
itself so it can't be used as a general purpose proxy.

## Project layout

- `src/CalorieTracker.jsx`: the app (React, lucide-react)
- `src/Charts.jsx`: Stats and Weight charts (recharts, loaded on demand)
- `src/index.html`, `src/sw.js`: templates the build fills in
- `api/messages.js`: the AI proxy
- `scripts/build.mjs`: build; `scripts/images.mjs`: favicon and social preview image
- `docs/`: the built site (committed so GitHub Pages can serve it)

## Add to your home screen

- **iPhone (Safari):** Share, then *Add to Home Screen*.
- **Android (Chrome):** menu, then *Install app*.

---

Built by [Joseph Leung](https://josephleung-site.vercel.app).
