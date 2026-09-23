// Shared palette and number helpers for the tracker and its charts.
export const C = {
  cream: "#FBF3E4",
  card: "#FFFFFF",
  ink: "#2B2118",
  inkSoft: "#6F6457",
  teal: "#147D74",
  tealSoft: "#D5EAE6",
  coral: "#E2603F",
  coralSoft: "#FBDDD3",
  sun: "#F2B705",
  sunSoft: "#FCEBBE",
  line: "#E8DCC6",
  green: "#2E7D3E",
  // darker shades of the brand colours for text and filled buttons (WCAG AA)
  coralInk: "#B84527",
  sunInk: "#8A6A00",
};

export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const fmt = (n) => Math.round(num(n)).toLocaleString();
