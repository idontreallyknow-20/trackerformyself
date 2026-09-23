// Builds the static site into docs/ (served by Vercel and GitHub Pages).
// Bundles the app with code splitting and hashed file names, then fills the
// index.html and sw.js templates in src/ with the generated file names.
import * as esbuild from "esbuild";
import { readFile, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const SITE_URL = (process.env.SITE_URL || "https://trackerformyself.vercel.app").replace(/\/$/, "");
const AUTHOR_URL = "https://josephleung-site.vercel.app";
const OUT = "docs";

await rm(path.join(OUT, "assets"), { recursive: true, force: true });

const result = await esbuild.build({
  entryPoints: ["src/main.jsx"],
  bundle: true,
  splitting: true,
  format: "esm",
  minify: true,
  target: "es2020",
  outdir: path.join(OUT, "assets"),
  entryNames: "[name]-[hash]",
  chunkNames: "chunk-[hash]",
  loader: { ".jsx": "jsx" },
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "none",
  metafile: true,
  logLevel: "warning",
});

const rel = (file) => path.relative(OUT, file).split(path.sep).join("/");
const outputs = result.metafile.outputs;
const entry = Object.keys(outputs).find((f) => outputs[f].entryPoint === "src/main.jsx");
const eagerChunks = outputs[entry].imports.filter((i) => i.kind === "import-statement").map((i) => rel(i.path));
const assetFiles = Object.keys(outputs).filter((f) => f.endsWith(".js")).map(rel);

const personId = `${AUTHOR_URL}/#joseph`;
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": personId,
      name: "Joseph Leung",
      alternateName: ["Joseph Wah Sing Leung", "Wah Sing Leung"],
      url: AUTHOR_URL,
      description:
        "Joseph Leung is a student founder from Richmond Hill, Ontario: a retired national-level chess player, calisthenics athlete, and the writer of the Daily Brief HQ newsletter.",
      homeLocation: { "@type": "Place", name: "Richmond Hill, Ontario, Canada" },
      sameAs: [
        "https://www.linkedin.com/in/joseph-leung-21b3473bb/",
        "https://github.com/idontreallyknow-20",
        "https://www.chess.com/member/squeakycrab",
        "https://lichess.org/@/BigTrustedCrabby",
        "https://lichess.org/@/UltraAddict2010",
        "https://ratings.fide.com/profile/2636654",
        "https://www.chess.ca/en/ratings/p/?id=167606",
        "https://dailybriefhq.com",
        "https://dailybriefhq.com/about",
        "https://nerfchess.com",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: "Bulk Tracker",
      description: "A free calorie and macro tracker for bulking, built by Joseph Leung.",
      inLanguage: "en-CA",
      creator: { "@id": personId },
      publisher: { "@id": personId },
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: "Bulk Tracker",
      url: `${SITE_URL}/`,
      image: `${SITE_URL}/og-image.png`,
      description:
        "A calorie and bulking tracker that treats the daily goal as a floor to hit. Photo and name lookup food estimates, macros and micros, bodyweight charting, a creatine streak and a 14 day calorie history.",
      applicationCategory: "HealthApplication",
      operatingSystem: "Any (web browser, installable PWA)",
      browserRequirements: "Requires JavaScript",
      offers: { "@type": "Offer", price: "0", priceCurrency: "CAD" },
      creator: { "@id": personId },
      author: { "@id": personId },
      isPartOf: { "@id": `${SITE_URL}/#website` },
      codeRepository: "https://github.com/idontreallyknow-20/trackerformyself",
    },
  ],
};

const preload = eagerChunks.map((c) => `<link rel="modulepreload" href="./${c}" />`).join("\n    ");
const html = (await readFile("src/index.html", "utf8"))
  .replaceAll("%SITE_URL%", SITE_URL)
  .replace("%JSON_LD%", JSON.stringify(jsonLd, null, 2).replace(/</g, "\\u003c").replace(/^/gm, "      "))
  .replace("%PRELOAD%", preload)
  .replace("%APP_JS%", rel(entry));
await writeFile(path.join(OUT, "index.html"), html);

const precache = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  ...assetFiles.map((f) => `./${f}`),
];
const version = createHash("sha256").update(html).update(precache.join()).digest("hex").slice(0, 10);
const sw = (await readFile("src/sw.js", "utf8"))
  .replace("__VERSION__", version)
  .replace("__ASSETS__", JSON.stringify(precache, null, 2));
await writeFile(path.join(OUT, "sw.js"), sw);

for (const f of assetFiles) {
  const kb = (outputs[path.join(OUT, f)].bytes / 1024).toFixed(1);
  console.log(`${f.padEnd(40)} ${kb.padStart(7)} kB`);
}
