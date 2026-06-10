# Bulk Tracker

A single-file React calorie and bulking tracker: photo and lookup food estimates,
macro and micro tracking, a creatine streak, weight charting, and a 14 day calorie
history. Treats the daily calorie goal as a floor to hit, not a ceiling.

- App component: `CalorieTracker.jsx` (one component, default export, uses only
  `react`, `lucide-react`, `recharts`).
- Installable web app (PWA): the prebuilt static site lives in `docs/`.

## Run it on your phone (installable app)

The `docs/` folder is a ready-to-host Progressive Web App. Host it once, then add
it to your home screen and it behaves like a native app (full screen, own icon,
opens offline).

### Host on GitHub Pages

1. Push this repo to GitHub (the `docs/` folder is already built).
2. On GitHub: **Settings -> Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
4. Choose your branch and the **`/docs`** folder, then **Save**.
5. Wait about a minute. Pages gives you a URL like
   `https://YOURNAME.github.io/trackerformyself/`.

### Add to your home screen

- **iPhone (Safari):** open the Pages URL, tap the Share button, tap
  *Add to Home Screen*.
- **Android (Chrome):** open the Pages URL, tap the menu, tap
  *Add to Home screen* or *Install app*.

Your data is saved on the device (it survives closing and reopening the app).

### Note on photo and lookup AI

The photo estimate and name lookup call the Anthropic API. Inside the Claude
artifact sandbox the key is provided for you. On a self-hosted copy there is no
key, so those calls fall back to the manual entry sheet. To enable them on your
own host, route the request through a small backend that adds your API key.

## Rebuild the static site

```bash
npm install
npm run build
```

This bundles `src/main.jsx` (which mounts `CalorieTracker.jsx`) into `docs/app.js`.
