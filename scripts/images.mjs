// Generates the favicon and the Open Graph preview image into docs/.
// Run with `npm run images` after changing the brand colours or copy.
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const C = {
  cream: "#FBF3E4",
  ink: "#2B2118",
  inkSoft: "#6F6457",
  teal: "#147D74",
  tealSoft: "#D5EAE6",
  coral: "#E2603F",
  sun: "#F2B705",
  sunSoft: "#FCEBBE",
  coralSoft: "#FBDDD3",
  line: "#E8DCC6",
};
const FLAME =
  "M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4";
const FONT = "'DejaVu Sans', 'Helvetica Neue', Arial, sans-serif";

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="${C.coral}"/>
  <g transform="translate(4 4)" fill="none" stroke="${C.cream}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="${FLAME}"/>
  </g>
</svg>
`;
await writeFile("docs/favicon.svg", favicon);
await sharp(Buffer.from(favicon), { density: 300 }).resize(32, 32).png().toFile("docs/favicon-32.png");

// Open Graph card: brand, headline, and a calorie ring like the app's Today tab
const W = 1200;
const H = 630;
const r = 150;
const circ = 2 * Math.PI * r;
const pct = 0.82;
const bar = (y, label, value, color, soft, frac) => `
  <text x="0" y="${y}" font-size="24" font-weight="700" fill="${C.ink}">${label}</text>
  <text x="330" y="${y}" font-size="22" fill="${C.inkSoft}" text-anchor="end">${value}</text>
  <rect x="0" y="${y + 14}" width="330" height="14" fill="${soft}"/>
  <rect x="0" y="${y + 14}" width="${330 * frac}" height="14" fill="${color}"/>`;

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
  <rect width="${W}" height="${H}" fill="${C.cream}"/>
  <rect x="0" y="0" width="${W}" height="12" fill="${C.teal}"/>

  <g transform="translate(80 84)">
    <rect width="84" height="84" fill="${C.coral}"/>
    <g transform="translate(12 12) scale(2.5)" fill="none" stroke="${C.cream}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="${FLAME}"/>
    </g>
    <text x="0" y="200" font-size="84" font-weight="800" fill="${C.ink}" letter-spacing="-2">Bulk Tracker</text>
    <text x="0" y="262" font-size="34" fill="${C.inkSoft}">A calorie tracker for bulking.</text>
    <text x="0" y="306" font-size="34" fill="${C.inkSoft}">The goal is a floor, not a ceiling.</text>
    <g transform="translate(0 372)">
      ${bar(0, "Protein", "164 / 180 g", C.teal, C.tealSoft, 0.91)}
    </g>
    <text x="0" y="486" font-size="28" font-weight="700" fill="${C.teal}">by Joseph Leung</text>
  </g>

  <g transform="translate(900 315)">
    <rect x="-210" y="-210" width="420" height="420" fill="#FFFFFF" stroke="${C.line}" stroke-width="2"/>
    <circle r="${r}" fill="none" stroke="${C.tealSoft}" stroke-width="30"/>
    <circle r="${r}" fill="none" stroke="${C.teal}" stroke-width="30"
      stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct)}" transform="rotate(-90)"/>
    <text y="10" font-size="64" font-weight="800" fill="${C.ink}" text-anchor="middle">2,460</text>
    <text y="52" font-size="24" fill="${C.inkSoft}" text-anchor="middle">of 3,000 kcal</text>
    <text y="92" font-size="24" font-weight="700" fill="#B84527" text-anchor="middle">540 to go</text>
  </g>
</svg>
`;
await sharp(Buffer.from(og)).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile("docs/og-image.png");
console.log("wrote docs/favicon.svg, docs/favicon-32.png, docs/og-image.png");
