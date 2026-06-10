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
your Anthropic API key, so the photo estimate and name lookup work on your phone.

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com), sign in with GitHub, and import this repo.
3. Vercel reads `vercel.json` automatically (build command and output are preset).
4. In the project, open **Settings -> Environment Variables** and add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key from [console.anthropic.com](https://console.anthropic.com)
     (this is the pay-as-you-go API, billed separately from a Claude Pro plan).
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

## Note on the AI and your Claude subscription

A Claude Pro subscription covers Claude.ai and the apps, but NOT the API. The photo
estimate and name lookup use the Anthropic API, which is billed separately through
the Anthropic Console. The Vercel setup above is what makes those features work on
your installed app, using your own API key.

## Rebuild the static site

```bash
npm install
npm run build
```

This bundles `src/main.jsx` (which mounts `CalorieTracker.jsx`) into `docs/app.js`.
