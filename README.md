# Bulk Tracker

A single-file React calorie and bulking tracker: photo and lookup food estimates,
macro and micro tracking, a creatine streak, weight charting, and a 14 day calorie
history. Treats the daily calorie goal as a floor to hit, not a ceiling.

- App component: `CalorieTracker.jsx` (one component, default export, uses only
  `react`, `lucide-react`, `recharts`).
- Installable web app (PWA): the prebuilt static site lives in `docs/`.

The `docs/` folder is a ready-to-host Progressive Web App. Host it once, then add
it to your home screen and it behaves like a native app (full screen, own icon,
opens offline). The photo camera and gallery import work in any real mobile
browser (they do NOT work inside the Claude artifact app, which sandboxes file
and camera access).

## Run it on your phone with working photo AI (Vercel, recommended)

Vercel hosts the app AND a tiny serverless function (`api/messages.js`) that holds
your AI key, so the photo estimate and name lookup work on your phone. The function
works with EITHER provider, whichever key you set:

- `GEMINI_API_KEY` - FREE. Get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
- `ANTHROPIC_API_KEY` - paid, from [console.anthropic.com](https://console.anthropic.com).

Steps:

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com), sign in with GitHub, and import this repo.
3. Vercel reads `vercel.json` automatically (build command and output are preset).
4. In the project, open **Settings -> Environment Variables** and add ONE of:
   - `GEMINI_API_KEY` = your free Google AI Studio key (recommended), or
   - `ANTHROPIC_API_KEY` = your Anthropic key.
5. **Deploy.** Vercel gives you a URL like `https://trackerformyself.vercel.app`.

The app calls the Anthropic API directly when it can; when the browser blocks that
(any normal host), it automatically falls back to `/api/messages`, which adds your
key server-side. Your key is never exposed to the browser.

## Run it on your phone without AI (GitHub Pages)

Simplest, no extra accounts. Camera and import work; the photo estimate falls back
to manual entry because there is no key.

1. Push this repo to GitHub (the `docs/` folder is already built).
2. On GitHub: **Settings -> Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
4. Choose your branch and the **`/docs`** folder, then **Save**.
5. Wait about a minute. Pages gives you a URL like
   `https://YOURNAME.github.io/trackerformyself/`.

## Add to your home screen

- **iPhone (Safari):** open the URL, tap the Share button, tap *Add to Home Screen*.
- **Android (Chrome):** open the URL, tap the menu, tap *Add to Home screen* or
  *Install app*.

Your data is saved on the device and survives closing and reopening the app.

## Note on subscriptions vs API keys

A Claude Pro or ChatGPT Plus subscription covers those chat apps, but NOT API
access. The photo estimate and name lookup use an AI API, which is a separate key.
The easiest free key is Google Gemini (aistudio.google.com/apikey); set it as
`GEMINI_API_KEY` in the Vercel setup above and the features work at no cost.

## Rebuild the static site

```bash
npm install
npm run build
```

This bundles `src/main.jsx` (which mounts `CalorieTracker.jsx`) into `docs/app.js`.
