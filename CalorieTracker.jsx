import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Flame, Plus, Camera, Image as ImageIcon, Search, Pencil, Trash2,
  Pill, Scale, Target, Calendar, ChevronDown, ChevronUp,
  X, Check, Utensils, Loader2, BarChart3, Home, Drumstick, Wheat,
  Droplet, Sparkles,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, ReferenceLine,
  ResponsiveContainer, Cell, Tooltip,
} from "recharts";

/* ============================================================
   Palette and constants
   ============================================================ */
const C = {
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
  green: "#3F8F4F",
};

const MEALS = ["Breakfast", "Lunch", "Snack", "Dinner"];
const SK = (k) => `jt:${k}`;

/* ============================================================
   Persistence: window.storage, personal scope, JSON, jt: keys
   ============================================================ */
const store = {
  async get(key, fallback) {
    try {
      const s = window.storage;
      let raw;
      if (s?.personal?.get) raw = await s.personal.get(SK(key));
      else if (s?.get) raw = await s.get(SK(key), { scope: "personal" });
      else raw = window.localStorage.getItem(SK(key));
      if (raw === null || raw === undefined) return fallback;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      try {
        const raw = window.localStorage.getItem(SK(key));
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    }
  },
  async set(key, value) {
    const json = JSON.stringify(value);
    try {
      const s = window.storage;
      if (s?.personal?.set) await s.personal.set(SK(key), json);
      else if (s?.set) await s.set(SK(key), json, { scope: "personal" });
      else window.localStorage.setItem(SK(key), json);
    } catch (e) {
      try { window.localStorage.setItem(SK(key), json); } catch {}
    }
  },
};

/* ============================================================
   Date helpers
   ============================================================ */
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
};
const dayKeyFromDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
const shortDay = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const weekday = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" });
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n) => Math.round(num(n)).toLocaleString();

/* ============================================================
   Default goal / targets
   ============================================================ */
const DEFAULT_GOAL = {
  calories: 3000,
  protein: 180,
  carbs: 350,
  fat: 90,
};

/* ============================================================
   Image downscale to jpeg dataURL
   ============================================================ */
function downscaleToJpeg(file, maxDim = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   Parse a JSON object out of a model text response
   ============================================================ */
function extractJson(text) {
  if (!text) return null;
  // strip code fences
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  const slice = t.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function normalizeEstimate(obj) {
  if (!obj || typeof obj !== "object") return null;
  return {
    name: String(obj.name || "Meal").slice(0, 80),
    calories: num(obj.calories),
    protein: num(obj.protein_g ?? obj.protein),
    carbs: num(obj.carbs_g ?? obj.carbs),
    fat: num(obj.fat_g ?? obj.fat),
    fiber: num(obj.fiber_g ?? obj.fiber),
    sugar: num(obj.sugar_g ?? obj.sugar),
    sodium: num(obj.sodium_mg ?? obj.sodium),
    satfat: num(obj.sat_fat_g ?? obj.satfat),
    confidence: obj.confidence || "medium",
    note: obj.note || "",
  };
}

/* ============================================================
   Anthropic API calls (no key, handled by sandbox)
   ============================================================ */
const PHOTO_PROMPT =
  "You are a nutrition estimator. Look at this meal photo. Break the meal into its " +
  "individual components and estimate the portion of each. Account for cooking oils, " +
  "butter, dressings, and sauces that add hidden calories. Then sum everything up. " +
  "Reply with ONLY a single JSON object and no other text, in this exact shape: " +
  '{"name": string, "calories": number, "protein_g": number, "carbs_g": number, ' +
  '"fat_g": number, "fiber_g": number, "sugar_g": number, "sodium_mg": number, ' +
  '"sat_fat_g": number, "confidence": "low"|"medium"|"high", "note": string}. ' +
  "The note should be one short sentence about assumptions you made.";

const LOOKUP_PROMPT = (q) =>
  "Find the official published nutrition facts for this food item: " +
  `"${q}". If it is a branded or restaurant item, use web search to find the ` +
  "official values for a single standard serving. Account for the typical serving size. " +
  "Reply with ONLY a single JSON object and no other text, in this exact shape: " +
  '{"name": string, "calories": number, "protein_g": number, "carbs_g": number, ' +
  '"fat_g": number, "fiber_g": number, "sugar_g": number, "sodium_mg": number, ' +
  '"sat_fat_g": number, "confidence": "low"|"medium"|"high", "note": string}. ' +
  "The note should name the serving size you used.";

function collectText(data) {
  if (!data) return "";
  if (typeof data === "string") return data;
  const content = data.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
}

async function estimateFromPhoto(jpegDataUrl) {
  const base64 = jpegDataUrl.split(",")[1];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64 },
            },
            { type: "text", text: PHOTO_PROMPT },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error("api error " + res.status);
  const data = await res.json();
  const est = normalizeEstimate(extractJson(collectText(data)));
  if (!est) throw new Error("parse failed");
  return est;
}

async function lookupByName(query) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: LOOKUP_PROMPT(query) }],
    }),
  });
  if (!res.ok) throw new Error("api error " + res.status);
  const data = await res.json();
  const est = normalizeEstimate(extractJson(collectText(data)));
  if (!est) throw new Error("parse failed");
  return est;
}

/* ============================================================
   Small UI atoms
   ============================================================ */
const font =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ flex: 1, padding: "10px 4px" }}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: color || C.ink,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 2 }}>{label}</div>
      {sub != null && (
        <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 1 }}>{sub}</div>
      )}
    </div>
  );
}

function MacroBar({ label, value, target, color, soft, icon }) {
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  const Icon = icon;
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 5,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {Icon && <Icon size={14} color={color} strokeWidth={2.4} />}
          <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{label}</span>
        </div>
        <span
          style={{
            fontSize: 12,
            color: C.inkSoft,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {fmt(value)} / {fmt(target)} g
        </span>
      </div>
      <div style={{ height: 9, background: soft, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct * 100}%`,
            background: color,
            transition: "width .35s ease",
          }}
        />
      </div>
    </div>
  );
}

function CalorieRing({ eaten, goal, size = 200 }) {
  const stroke = 18;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(1, eaten / goal) : 0;
  const over = goal > 0 && eaten > goal;
  const left = Math.max(0, goal - eaten);
  const ringColor = over ? C.sun : C.teal;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.tealSoft} strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          style={{ transition: "stroke-dashoffset .5s ease, stroke .3s" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Flame size={18} color={C.coral} fill={C.coral} />
          <span
            style={{
              fontSize: 38,
              fontWeight: 800,
              color: C.ink,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            {fmt(eaten)}
          </span>
        </div>
        <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 4 }}>
          of {fmt(goal)} kcal
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            fontWeight: 700,
            color: over ? C.green : C.coral,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {over ? `${fmt(eaten - goal)} over goal` : `${fmt(left)} to go`}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Sheet (bottom modal)
   ============================================================ */
function Sheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43,33,24,0.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: C.cream,
          maxHeight: "92vh",
          overflowY: "auto",
          borderTop: `3px solid ${C.teal}`,
          boxShadow: "0 -8px 30px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            background: C.cream,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 18px",
            borderBottom: `1px solid ${C.line}`,
            zIndex: 2,
          }}
        >
          <span style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>{title}</span>
          <button
            onClick={onClose}
            style={{
              background: C.card,
              border: `1px solid ${C.line}`,
              padding: 7,
              cursor: "pointer",
              display: "flex",
            }}
          >
            <X size={18} color={C.ink} />
          </button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: C.inkSoft,
          display: "block",
          marginBottom: 5,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  fontSize: 16,
  fontFamily: font,
  border: `1px solid ${C.line}`,
  background: C.card,
  color: C.ink,
  outline: "none",
  borderRadius: 0,
  fontVariantNumeric: "tabular-nums",
};

function NumIn({ value, onChange, suffix }) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
      {suffix && (
        <span
          style={{
            position: "absolute",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 12,
            color: C.inkSoft,
          }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
}

/* ============================================================
   Edit meal sheet
   ============================================================ */
function MealEditor({ open, initial, onClose, onSave, onDelete }) {
  const [f, setF] = useState(initial || {});
  useEffect(() => {
    setF(initial || {});
  }, [initial, open]);
  if (!open) return null;
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const conf = f.confidence;
  return (
    <Sheet open={open} onClose={onClose} title={f.id ? "Edit food" : "Add food"}>
      {f.note ? (
        <div
          style={{
            background: C.tealSoft,
            border: `1px solid ${C.teal}`,
            padding: "9px 11px",
            marginBottom: 14,
            fontSize: 12,
            color: C.ink,
            display: "flex",
            gap: 7,
          }}
        >
          <Sparkles size={15} color={C.teal} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            {conf && (
              <strong style={{ textTransform: "capitalize" }}>{conf} confidence. </strong>
            )}
            {f.note}
          </span>
        </div>
      ) : null}

      <Field label="Name">
        <input
          value={f.name || ""}
          onChange={(e) => set("name")(e.target.value)}
          style={inputStyle}
          placeholder="What did you eat"
        />
      </Field>

      <Field label="Meal">
        <div style={{ display: "flex", gap: 8 }}>
          {MEALS.map((m) => (
            <button
              key={m}
              onClick={() => set("meal")(m)}
              style={{
                flex: 1,
                padding: "9px 4px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${f.meal === m ? C.teal : C.line}`,
                background: f.meal === m ? C.teal : C.card,
                color: f.meal === m ? "#fff" : C.inkSoft,
                fontFamily: font,
                borderRadius: 0,
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Calories">
        <NumIn value={f.calories ?? ""} onChange={set("calories")} suffix="kcal" />
      </Field>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Protein">
            <NumIn value={f.protein ?? ""} onChange={set("protein")} suffix="g" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Carbs">
            <NumIn value={f.carbs ?? ""} onChange={set("carbs")} suffix="g" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Fat">
            <NumIn value={f.fat ?? ""} onChange={set("fat")} suffix="g" />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Fiber">
            <NumIn value={f.fiber ?? ""} onChange={set("fiber")} suffix="g" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Sugar">
            <NumIn value={f.sugar ?? ""} onChange={set("sugar")} suffix="g" />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Sodium">
            <NumIn value={f.sodium ?? ""} onChange={set("sodium")} suffix="mg" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Saturated fat">
            <NumIn value={f.satfat ?? ""} onChange={set("satfat")} suffix="g" />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {f.id && onDelete && (
          <button
            onClick={() => onDelete(f.id)}
            style={{
              padding: "13px 16px",
              background: C.card,
              border: `1px solid ${C.coral}`,
              color: C.coral,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 600,
              fontFamily: font,
              borderRadius: 0,
            }}
          >
            <Trash2 size={16} /> Delete
          </button>
        )}
        <button
          onClick={() =>
            onSave({
              ...f,
              id: f.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              meal: f.meal || "Snack",
              name: (f.name || "Food").trim(),
              calories: num(f.calories),
              protein: num(f.protein),
              carbs: num(f.carbs),
              fat: num(f.fat),
              fiber: num(f.fiber),
              sugar: num(f.sugar),
              sodium: num(f.sodium),
              satfat: num(f.satfat),
            })
          }
          style={{
            flex: 1,
            padding: "13px 16px",
            background: C.teal,
            border: "none",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            fontWeight: 700,
            fontSize: 15,
            fontFamily: font,
            borderRadius: 0,
          }}
        >
          <Check size={18} /> Save
        </button>
      </div>
    </Sheet>
  );
}

/* ============================================================
   Lookup sheet
   ============================================================ */
function LookupSheet({ open, onClose, onResult }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (open) {
      setQ("");
      setErr("");
      setBusy(false);
    }
  }, [open]);

  const go = async () => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      const est = await lookupByName(q.trim());
      onResult({ ...est, meal: "Snack" });
    } catch (e) {
      setErr("Could not find that. Try again or add it manually.");
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Look up a food">
      <Field label="Food name, brand, or restaurant item">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          style={inputStyle}
          placeholder="e.g. Chipotle chicken burrito bowl"
          autoFocus
        />
      </Field>
      {err && (
        <div style={{ color: C.coral, fontSize: 13, marginBottom: 12 }}>{err}</div>
      )}
      <button
        onClick={go}
        disabled={busy}
        style={{
          width: "100%",
          padding: "13px 16px",
          background: busy ? C.inkSoft : C.teal,
          border: "none",
          color: "#fff",
          cursor: busy ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          fontWeight: 700,
          fontSize: 15,
          fontFamily: font,
          borderRadius: 0,
        }}
      >
        {busy ? (
          <>
            <Loader2 size={18} className="jt-spin" /> Searching nutrition facts
          </>
        ) : (
          <>
            <Search size={18} /> Look up
          </>
        )}
      </button>
    </Sheet>
  );
}

/* ============================================================
   Main component
   ============================================================ */
export default function CalorieTracker() {
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("today");

  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [days, setDays] = useState({}); // { 'YYYY-MM-DD': [meal,...] }
  const [weights, setWeights] = useState([]); // [{date, kg}]
  const [creatine, setCreatine] = useState({}); // { 'YYYY-MM-DD': true }
  const [weightUnit, setWeightUnit] = useState("lb");

  const [editor, setEditor] = useState({ open: false, initial: null });
  const [addOpen, setAddOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const [expanded, setExpanded] = useState({});

  const tk = todayKey();

  /* ---- load ---- */
  useEffect(() => {
    (async () => {
      const [g, d, w, cr, wu] = await Promise.all([
        store.get("goal", DEFAULT_GOAL),
        store.get("days", {}),
        store.get("weights", []),
        store.get("creatine", {}),
        store.get("weightUnit", "lb"),
      ]);
      setGoal({ ...DEFAULT_GOAL, ...(g || {}) });
      setDays(d || {});
      setWeights(Array.isArray(w) ? w : []);
      setCreatine(cr || {});
      setWeightUnit(wu || "lb");
      setLoaded(true);
    })();
  }, []);

  /* ---- persist ---- */
  useEffect(() => { if (loaded) store.set("goal", goal); }, [goal, loaded]);
  useEffect(() => { if (loaded) store.set("days", days); }, [days, loaded]);
  useEffect(() => { if (loaded) store.set("weights", weights); }, [weights, loaded]);
  useEffect(() => { if (loaded) store.set("creatine", creatine); }, [creatine, loaded]);
  useEffect(() => { if (loaded) store.set("weightUnit", weightUnit); }, [weightUnit, loaded]);

  const todayMeals = days[tk] || [];

  const totals = useMemo(() => {
    const t = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, satfat: 0 };
    for (const m of todayMeals) {
      t.calories += num(m.calories);
      t.protein += num(m.protein);
      t.carbs += num(m.carbs);
      t.fat += num(m.fat);
      t.fiber += num(m.fiber);
      t.sugar += num(m.sugar);
      t.sodium += num(m.sodium);
      t.satfat += num(m.satfat);
    }
    return t;
  }, [todayMeals]);

  /* ---- meal CRUD ---- */
  const saveMeal = (meal) => {
    setDays((prev) => {
      const list = prev[tk] ? [...prev[tk]] : [];
      const idx = list.findIndex((m) => m.id === meal.id);
      if (idx >= 0) list[idx] = meal;
      else list.push(meal);
      return { ...prev, [tk]: list };
    });
    setEditor({ open: false, initial: null });
  };
  const deleteMeal = (id) => {
    setDays((prev) => {
      const list = (prev[tk] || []).filter((m) => m.id !== id);
      return { ...prev, [tk]: list };
    });
    setEditor({ open: false, initial: null });
  };

  /* ---- photo flow (called from native label input change) ---- */
  const handlePhoto = useCallback(async (file) => {
    if (!file) return;
    setPhotoErr("");
    setPhotoBusy(true);
    try {
      const jpeg = await downscaleToJpeg(file);
      const est = await estimateFromPhoto(jpeg);
      setPhotoBusy(false);
      setAddOpen(false);
      setEditor({ open: true, initial: { ...est, meal: "Snack" } });
    } catch (e) {
      setPhotoBusy(false);
      setAddOpen(false);
      // fall back to manual sheet
      setEditor({
        open: true,
        initial: { meal: "Snack", name: "", note: "Photo estimate failed, enter it manually." },
      });
    }
  }, []);

  /* ---- creatine ---- */
  const creatineStreak = useMemo(() => {
    let streak = 0;
    const d = new Date();
    // If not taken today, streak counts up to yesterday
    if (!creatine[dayKeyFromDate(d)]) d.setDate(d.getDate() - 1);
    while (creatine[dayKeyFromDate(d)]) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }, [creatine]);
  const tookCreatine = !!creatine[tk];
  const toggleCreatine = () =>
    setCreatine((prev) => {
      const n = { ...prev };
      if (n[tk]) delete n[tk];
      else n[tk] = true;
      return n;
    });

  /* ---- pace note ---- */
  const paceNote = useMemo(() => {
    const now = new Date();
    const hours = now.getHours() + now.getMinutes() / 60;
    // expected intake assumes eating window 8:00 to 21:00
    const start = 8, end = 21;
    const frac = Math.max(0, Math.min(1, (hours - start) / (end - start)));
    const expected = goal.calories * frac;
    const diff = totals.calories - expected;
    if (frac <= 0.02) return "Fresh start to the day. Time to fuel up.";
    if (Math.abs(diff) < goal.calories * 0.07)
      return "Right on pace for your goal so far today.";
    if (diff < 0)
      return `About ${fmt(-diff)} kcal behind pace. Eat up to stay on track for the bulk.`;
    return `Ahead of pace by ${fmt(diff)} kcal. Strong eating day.`;
  }, [totals.calories, goal.calories]);

  /* ---- suggestions ---- */
  const suggestions = useMemo(() => {
    const out = [];
    const now = new Date();
    const hours = now.getHours() + now.getMinutes() / 60;
    const frac = Math.max(0.0001, Math.min(1, (hours - 8) / (21 - 8)));
    const calLeft = goal.calories - totals.calories;
    const proLeft = goal.protein - totals.protein;

    if (calLeft > goal.calories * 0.25 && frac > 0.6)
      out.push({ icon: Flame, color: C.coral, text: `Behind on calories. ${fmt(calLeft)} kcal left to hit your bulk goal.` });
    if (proLeft > goal.protein * 0.3)
      out.push({ icon: Drumstick, color: C.teal, text: `Protein is low. ${fmt(proLeft)}g to go. Add a shake or lean meat.` });
    if (totals.fiber < 12 && totals.calories > goal.calories * 0.4)
      out.push({ icon: Wheat, color: C.sun, text: `Fiber is light at ${fmt(totals.fiber)}g. Add fruit, oats, or veg.` });
    if (totals.satfat > 25)
      out.push({ icon: Droplet, color: C.coral, text: `Saturated fat is high at ${fmt(totals.satfat)}g. Lean out the next meal.` });
    if (totals.sodium > 3000)
      out.push({ icon: Droplet, color: C.coral, text: `Sodium is high at ${fmt(totals.sodium)}mg today.` });
    if (out.length === 0 && totals.calories >= goal.calories)
      out.push({ icon: Check, color: C.green, text: "Goal hit. Great surplus day for building." });
    if (out.length === 0)
      out.push({ icon: Sparkles, color: C.teal, text: "Looking balanced. Keep the meals coming." });
    return out.slice(0, 3);
  }, [totals, goal]);

  /* ---- 14 day series ---- */
  const series14 = useMemo(() => {
    const arr = [];
    const d = new Date();
    for (let i = 13; i >= 0; i--) {
      const dd = new Date(d);
      dd.setDate(d.getDate() - i);
      const key = dayKeyFromDate(dd);
      const meals = days[key] || [];
      const cals = meals.reduce((s, m) => s + num(m.calories), 0);
      arr.push({ key, label: shortDay(key), cals: Math.round(cals) });
    }
    return arr;
  }, [days]);

  /* ---- weight derived ---- */
  const sortedWeights = useMemo(
    () => [...weights].sort((a, b) => a.date.localeCompare(b.date)),
    [weights]
  );
  const toDisplay = (kg) => (weightUnit === "lb" ? kg * 2.2046226 : kg);
  const fromDisplay = (v) => (weightUnit === "lb" ? v / 2.2046226 : v);

  /* ============================================================
     Render
     ============================================================ */
  if (!loaded)
    return (
      <div style={{ ...page, alignItems: "center", justifyContent: "center", display: "flex" }}>
        <Loader2 size={28} color={C.teal} className="jt-spin" />
      </div>
    );

  return (
    <div style={page}>
      <style>{`
        .jt-spin { animation: jtspin 1s linear infinite; }
        @keyframes jtspin { to { transform: rotate(360deg); } }
        * { -webkit-tap-highlight-color: transparent; }
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "18px 18px 6px", maxWidth: 480, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 34, height: 34, background: C.coral, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Utensils size={19} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: C.ink, letterSpacing: -0.3 }}>
              Bulk Tracker
            </div>
            <div style={{ fontSize: 11, color: C.inkSoft }}>
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", maxWidth: 480, margin: "0 auto", width: "100%", boxSizing: "border-box", padding: "8px 14px 110px" }}>
        {tab === "today" && (
          <TodayTab
            totals={totals}
            goal={goal}
            meals={todayMeals}
            paceNote={paceNote}
            suggestions={suggestions}
            tookCreatine={tookCreatine}
            creatineStreak={creatineStreak}
            toggleCreatine={toggleCreatine}
            onEdit={(m) => setEditor({ open: true, initial: m })}
          />
        )}
        {tab === "stats" && (
          <StatsTab
            series={series14}
            goal={goal}
            days={days}
            expanded={expanded}
            setExpanded={setExpanded}
          />
        )}
        {tab === "weight" && (
          <WeightTab
            sortedWeights={sortedWeights}
            unit={weightUnit}
            setUnit={setWeightUnit}
            toDisplay={toDisplay}
            fromDisplay={fromDisplay}
            onAdd={(entry) =>
              setWeights((prev) => {
                const others = prev.filter((w) => w.date !== entry.date);
                return [...others, entry];
              })
            }
            onDelete={(date) => setWeights((prev) => prev.filter((w) => w.date !== date))}
          />
        )}
        {tab === "goal" && (
          <GoalTab
            goal={goal}
            setGoal={setGoal}
            onClear={() => {
              setDays({});
              setWeights([]);
              setCreatine({});
            }}
          />
        )}
      </div>

      {/* Floating add button (Today tab) */}
      {tab === "today" && (
        <button
          onClick={() => setAddOpen(true)}
          style={{
            position: "fixed",
            bottom: 78,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 30,
            background: C.coral,
            color: "#fff",
            border: "none",
            padding: "13px 22px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 700,
            fontSize: 15,
            fontFamily: font,
            cursor: "pointer",
            boxShadow: "0 6px 18px rgba(226,96,63,0.4)",
            borderRadius: 0,
          }}
        >
          <Plus size={20} /> Log food
        </button>
      )}

      {/* Bottom tab bar */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: C.card,
          borderTop: `1px solid ${C.line}`,
          display: "flex",
          maxWidth: 480,
          margin: "0 auto",
          zIndex: 25,
        }}
      >
        {[
          { id: "today", label: "Today", icon: Home },
          { id: "stats", label: "Stats", icon: BarChart3 },
          { id: "weight", label: "Weight", icon: Scale },
          { id: "goal", label: "Goal", icon: Target },
        ].map((t) => {
          const I = t.icon;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: "11px 0 14px",
                background: "none",
                border: "none",
                borderTop: `3px solid ${on ? C.teal : "transparent"}`,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                fontFamily: font,
              }}
            >
              <I size={21} color={on ? C.teal : C.inkSoft} strokeWidth={on ? 2.5 : 2} />
              <span style={{ fontSize: 10.5, fontWeight: on ? 700 : 500, color: on ? C.teal : C.inkSoft }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Add method sheet */}
      <Sheet open={addOpen} onClose={() => !photoBusy && setAddOpen(false)} title="Log food">
        {photoBusy ? (
          <div style={{ padding: "30px 0", textAlign: "center" }}>
            <Loader2 size={30} color={C.teal} className="jt-spin" />
            <div style={{ marginTop: 14, fontSize: 14, color: C.inkSoft }}>
              Estimating your meal from the photo
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {photoErr && <div style={{ color: C.coral, fontSize: 13 }}>{photoErr}</div>}

            {/* Native label-wrapped inputs for mobile camera + gallery */}
            <label style={addBtn(C.teal)}>
              <Camera size={20} color="#fff" />
              <span>Take a photo</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files && e.target.files[0];
                  e.target.value = "";
                  handlePhoto(file);
                }}
              />
            </label>

            <label style={addBtn(C.sun, C.ink)}>
              <ImageIcon size={20} color={C.ink} />
              <span>Pick from gallery</span>
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files && e.target.files[0];
                  e.target.value = "";
                  handlePhoto(file);
                }}
              />
            </label>

            <button
              style={{ ...addBtn(C.card, C.ink), border: `1px solid ${C.teal}` }}
              onClick={() => {
                setAddOpen(false);
                setLookupOpen(true);
              }}
            >
              <Search size={20} color={C.teal} />
              <span>Look up by name</span>
            </button>

            <button
              style={{ ...addBtn(C.card, C.ink), border: `1px solid ${C.line}` }}
              onClick={() => {
                setAddOpen(false);
                setEditor({ open: true, initial: { meal: "Snack" } });
              }}
            >
              <Pencil size={20} color={C.inkSoft} />
              <span>Add manually</span>
            </button>
          </div>
        )}
      </Sheet>

      <LookupSheet
        open={lookupOpen}
        onClose={() => setLookupOpen(false)}
        onResult={(est) => {
          setLookupOpen(false);
          setEditor({ open: true, initial: est });
        }}
      />

      <MealEditor
        open={editor.open}
        initial={editor.initial}
        onClose={() => setEditor({ open: false, initial: null })}
        onSave={saveMeal}
        onDelete={deleteMeal}
      />
    </div>
  );
}

const addBtn = (bg, color = "#fff") => ({
  width: "100%",
  boxSizing: "border-box",
  padding: "15px 16px",
  background: bg,
  color,
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 11,
  fontWeight: 600,
  fontSize: 15,
  fontFamily: font,
  borderRadius: 0,
});

const page = {
  fontFamily: font,
  background: C.cream,
  color: C.ink,
  minHeight: "100vh",
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  width: "100%",
  maxWidth: "100%",
  overflow: "hidden",
};

const cardStyle = {
  background: C.card,
  border: `1px solid ${C.line}`,
  padding: 16,
  marginBottom: 14,
};

/* ============================================================
   Today tab
   ============================================================ */
function TodayTab({ totals, goal, meals, paceNote, suggestions, tookCreatine, creatineStreak, toggleCreatine, onEdit }) {
  const micros = [
    { label: "Fiber", value: totals.fiber, suffix: "g", color: C.sun },
    { label: "Sugar", value: totals.sugar, suffix: "g", color: C.coral },
    { label: "Sodium", value: totals.sodium, suffix: "mg", color: C.teal },
    { label: "Sat fat", value: totals.satfat, suffix: "g", color: C.coral },
  ];

  const byMeal = MEALS.map((m) => ({ meal: m, items: meals.filter((x) => x.meal === m) })).filter(
    (g) => g.items.length
  );

  return (
    <div>
      {/* Ring card */}
      <div style={{ ...cardStyle, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 22, paddingBottom: 18 }}>
        <CalorieRing eaten={totals.calories} goal={goal.calories} />
        <div
          style={{
            marginTop: 14,
            fontSize: 13,
            color: C.ink,
            background: C.sunSoft,
            border: `1px solid ${C.sun}`,
            padding: "8px 12px",
            textAlign: "center",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          {paceNote}
        </div>
      </div>

      {/* Macros */}
      <div style={cardStyle}>
        <SectionTitle icon={BarChart3} text="Macros" />
        <MacroBar label="Protein" value={totals.protein} target={goal.protein} color={C.teal} soft={C.tealSoft} icon={Drumstick} />
        <MacroBar label="Carbs" value={totals.carbs} target={goal.carbs} color={C.sun} soft={C.sunSoft} icon={Wheat} />
        <MacroBar label="Fat" value={totals.fat} target={goal.fat} color={C.coral} soft={C.coralSoft} icon={Droplet} />

        <div style={{ display: "flex", borderTop: `1px solid ${C.line}`, marginTop: 6, paddingTop: 4 }}>
          {micros.map((m) => (
            <div key={m.label} style={{ flex: 1, textAlign: "center", padding: "8px 2px" }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: m.color, fontVariantNumeric: "tabular-nums" }}>
                {fmt(m.value)}
              </div>
              <div style={{ fontSize: 10.5, color: C.inkSoft, marginTop: 2 }}>
                {m.label} ({m.suffix})
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Suggestions */}
      <div style={cardStyle}>
        <SectionTitle icon={Sparkles} text="Suggestions" />
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {suggestions.map((s, i) => {
            const I = s.icon;
            return (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <div style={{ width: 26, height: 26, flexShrink: 0, background: C.cream, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <I size={15} color={s.color} strokeWidth={2.3} />
                </div>
                <span style={{ fontSize: 13, color: C.ink, lineHeight: 1.45, paddingTop: 4 }}>{s.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Creatine */}
      <button
        onClick={toggleCreatine}
        style={{
          ...cardStyle,
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          fontFamily: font,
          display: "flex",
          alignItems: "center",
          gap: 13,
          background: tookCreatine ? C.tealSoft : C.card,
          borderColor: tookCreatine ? C.teal : C.line,
        }}
      >
        <div style={{ width: 44, height: 44, flexShrink: 0, background: tookCreatine ? C.teal : C.cream, border: `1px solid ${tookCreatine ? C.teal : C.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Pill size={22} color={tookCreatine ? "#fff" : C.inkSoft} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Creatine</div>
          <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 1 }}>
            {tookCreatine ? "Logged for today. Tap to undo." : "Tap to log today's dose."}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.teal, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            {creatineStreak}
          </div>
          <div style={{ fontSize: 10, color: C.inkSoft, marginTop: 2 }}>day streak</div>
        </div>
      </button>

      {/* Today's food list */}
      <div style={cardStyle}>
        <SectionTitle icon={Utensils} text="Today's food" />
        {meals.length === 0 ? (
          <div style={{ fontSize: 13, color: C.inkSoft, padding: "10px 0", textAlign: "center" }}>
            Nothing logged yet. Tap Log food to start your day.
          </div>
        ) : (
          byMeal.map((g) => (
            <div key={g.meal} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
                {g.meal}
              </div>
              {g.items.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onEdit(m)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: C.cream,
                    border: `1px solid ${C.line}`,
                    padding: "10px 12px",
                    marginBottom: 6,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontFamily: font,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {m.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.inkSoft, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                      P {fmt(m.protein)}  C {fmt(m.carbs)}  F {fmt(m.fat)}
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.coral, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    {fmt(m.calories)}
                  </div>
                  <Pencil size={15} color={C.inkSoft} style={{ flexShrink: 0 }} />
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SectionTitle({ icon: I, text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 13 }}>
      <I size={16} color={C.teal} strokeWidth={2.4} />
      <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{text}</span>
    </div>
  );
}

/* ============================================================
   Stats tab
   ============================================================ */
function StatsTab({ series, goal, days, expanded, setExpanded }) {
  const logged = series.filter((d) => d.cals > 0);
  const avg = logged.length ? Math.round(logged.reduce((s, d) => s + d.cals, 0) / logged.length) : 0;
  const hit = logged.filter((d) => d.cals >= goal.calories).length;

  const historyKeys = Object.keys(days)
    .filter((k) => (days[k] || []).length)
    .sort((a, b) => b.localeCompare(a));

  return (
    <div>
      <div style={cardStyle}>
        <SectionTitle icon={BarChart3} text="Last 14 days" />
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={series} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.inkSoft }} interval={1} axisLine={{ stroke: C.line }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: C.inkSoft }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: C.sunSoft }}
                contentStyle={{ borderRadius: 0, border: `1px solid ${C.line}`, fontSize: 12 }}
                formatter={(v) => [`${fmt(v)} kcal`, "Eaten"]}
              />
              <ReferenceLine y={goal.calories} stroke={C.teal} strokeDasharray="4 3" strokeWidth={1.5} />
              <Bar dataKey="cals" radius={0}>
                {series.map((d, i) => (
                  <Cell key={i} fill={d.cals >= goal.calories ? C.teal : d.cals > 0 ? C.coral : C.line} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "flex", borderTop: `1px solid ${C.line}`, marginTop: 8 }}>
          <Stat label="Daily average" value={fmt(avg)} sub="kcal" color={C.ink} />
          <Stat label="Goal hit" value={`${hit}/${logged.length}`} sub="days" color={C.teal} />
          <Stat label="Goal floor" value={fmt(goal.calories)} sub="kcal" color={C.inkSoft} />
        </div>
      </div>

      <div style={cardStyle}>
        <SectionTitle icon={Calendar} text="History" />
        {historyKeys.length === 0 ? (
          <div style={{ fontSize: 13, color: C.inkSoft, textAlign: "center", padding: "8px 0" }}>
            No history yet.
          </div>
        ) : (
          historyKeys.map((key) => {
            const meals = days[key] || [];
            const t = meals.reduce(
              (a, m) => ({
                cals: a.cals + num(m.calories),
                p: a.p + num(m.protein),
                c: a.c + num(m.carbs),
                f: a.f + num(m.fat),
              }),
              { cals: 0, p: 0, c: 0, f: 0 }
            );
            const open = expanded[key];
            return (
              <div key={key} style={{ borderBottom: `1px solid ${C.line}` }}>
                <button
                  onClick={() => setExpanded((s) => ({ ...s, [key]: !s[key] }))}
                  style={{ width: "100%", background: "none", border: "none", padding: "11px 2px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontFamily: font, textAlign: "left" }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>
                      {weekday(key)}, {shortDay(key)}
                    </div>
                    <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>
                      P {fmt(t.p)}  C {fmt(t.c)}  F {fmt(t.f)}
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.cals >= goal.calories ? C.teal : C.coral, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(t.cals)}
                  </div>
                  {open ? <ChevronUp size={17} color={C.inkSoft} /> : <ChevronDown size={17} color={C.inkSoft} />}
                </button>
                {open && (
                  <div style={{ padding: "0 2px 10px" }}>
                    {meals.map((m) => (
                      <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12.5, color: C.inkSoft }}>
                        <span>
                          <span style={{ color: C.inkSoft, fontSize: 10.5 }}>{m.meal} </span>
                          <span style={{ color: C.ink }}>{m.name}</span>
                        </span>
                        <span style={{ fontVariantNumeric: "tabular-nums", color: C.ink }}>{fmt(m.calories)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Weight tab
   ============================================================ */
function WeightTab({ sortedWeights, unit, setUnit, toDisplay, fromDisplay, onAdd, onDelete }) {
  const [val, setVal] = useState("");
  const [date, setDate] = useState(todayKey());

  const data = sortedWeights.map((w) => ({
    date: w.date,
    label: shortDay(w.date),
    v: Math.round(toDisplay(w.kg) * 10) / 10,
  }));

  const start = data[0];
  const now = data[data.length - 1];
  const change = start && now ? now.v - start.v : 0;

  const add = () => {
    const v = Number(val);
    if (!Number.isFinite(v) || v <= 0) return;
    onAdd({ date, kg: fromDisplay(v) });
    setVal("");
  };

  return (
    <div>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 13 }}>
          <SectionTitle icon={Scale} text="Bodyweight" />
          <div style={{ display: "flex", border: `1px solid ${C.line}` }}>
            {["lb", "kg"].map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                style={{ padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", fontFamily: font, background: unit === u ? C.teal : C.card, color: unit === u ? "#fff" : C.inkSoft }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 9, marginBottom: 4 }}>
          <div style={{ flex: 1 }}>
            <input
              type="number"
              inputMode="decimal"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder={`Weight (${unit})`}
              style={inputStyle}
            />
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ ...inputStyle, width: 140, flexShrink: 0 }}
          />
          <button
            onClick={add}
            style={{ padding: "0 16px", background: C.teal, color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", fontFamily: font, flexShrink: 0 }}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.line}`, marginBottom: 8 }}>
          <Stat label="Start" value={start ? start.v.toFixed(1) : "--"} sub={unit} />
          <Stat label="Now" value={now ? now.v.toFixed(1) : "--"} sub={unit} color={C.teal} />
          <Stat
            label="Change"
            value={(change >= 0 ? "+" : "") + change.toFixed(1)}
            sub={unit}
            color={change > 0 ? C.green : change < 0 ? C.coral : C.inkSoft}
          />
        </div>
        <div style={{ width: "100%", height: 200 }}>
          {data.length >= 2 ? (
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 10, right: 10, left: -14, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.inkSoft }} axisLine={{ stroke: C.line }} tickLine={false} />
                <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 10, fill: C.inkSoft }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 0, border: `1px solid ${C.line}`, fontSize: 12 }} formatter={(v) => [`${v} ${unit}`, "Weight"]} />
                <Line type="monotone" dataKey="v" stroke={C.teal} strokeWidth={2.5} dot={{ r: 3, fill: C.teal }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: C.inkSoft }}>
              Log at least two weigh-ins to see your trend.
            </div>
          )}
        </div>
      </div>

      {sortedWeights.length > 0 && (
        <div style={cardStyle}>
          <SectionTitle icon={Calendar} text="Weigh-ins" />
          {[...sortedWeights].reverse().map((w) => (
            <div key={w.date} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
              <span style={{ fontSize: 13, color: C.ink }}>
                {weekday(w.date)}, {shortDay(w.date)}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                  {(Math.round(toDisplay(w.kg) * 10) / 10).toFixed(1)} {unit}
                </span>
                <button onClick={() => onDelete(w.date)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 2 }}>
                  <Trash2 size={15} color={C.coral} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Goal tab
   ============================================================ */
function GoalTab({ goal, setGoal, onClear }) {
  const [g, setG] = useState(goal);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setG(goal), [goal]);
  const set = (k) => (v) => setG((s) => ({ ...s, [k]: num(v) }));
  const dirty =
    g.calories !== goal.calories || g.protein !== goal.protein || g.carbs !== goal.carbs || g.fat !== goal.fat;

  const macroCals = g.protein * 4 + g.carbs * 4 + g.fat * 9;

  return (
    <div>
      <div style={cardStyle}>
        <SectionTitle icon={Flame} text="Daily calorie goal" />
        <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 10, lineHeight: 1.5 }}>
          This is treated as a floor to hit for your bulk, not a ceiling.
        </div>
        <NumIn value={g.calories} onChange={set("calories")} suffix="kcal" />
      </div>

      <div style={cardStyle}>
        <SectionTitle icon={Target} text="Macro targets" />
        <Field label="Protein (g)">
          <NumIn value={g.protein} onChange={set("protein")} suffix="g" />
        </Field>
        <Field label="Carbs (g)">
          <NumIn value={g.carbs} onChange={set("carbs")} suffix="g" />
        </Field>
        <Field label="Fat (g)">
          <NumIn value={g.fat} onChange={set("fat")} suffix="g" />
        </Field>
        <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 2, background: C.cream, padding: "8px 10px", border: `1px solid ${C.line}` }}>
          Macros add up to{" "}
          <strong style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmt(macroCals)}</strong> kcal.
        </div>
      </div>

      <button
        onClick={() => setGoal(g)}
        disabled={!dirty}
        style={{
          width: "100%",
          padding: "14px",
          background: dirty ? C.teal : C.line,
          color: dirty ? "#fff" : C.inkSoft,
          border: "none",
          cursor: dirty ? "pointer" : "default",
          fontWeight: 700,
          fontSize: 15,
          fontFamily: font,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          marginBottom: 22,
          borderRadius: 0,
        }}
      >
        <Check size={18} /> {dirty ? "Save goals" : "Saved"}
      </button>

      <div style={{ ...cardStyle, borderColor: C.coral }}>
        <SectionTitle icon={Trash2} text="Clear history" />
        <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 12, lineHeight: 1.5 }}>
          Removes all logged food, weigh-ins, and creatine days. Your goals are kept. This cannot be undone.
        </div>
        {confirm ? (
          <div style={{ display: "flex", gap: 9 }}>
            <button
              onClick={() => setConfirm(false)}
              style={{ flex: 1, padding: "12px", background: C.card, border: `1px solid ${C.line}`, color: C.ink, cursor: "pointer", fontWeight: 600, fontFamily: font, borderRadius: 0 }}
            >
              Cancel
            </button>
            <button
              onClick={() => { onClear(); setConfirm(false); }}
              style={{ flex: 1, padding: "12px", background: C.coral, border: "none", color: "#fff", cursor: "pointer", fontWeight: 700, fontFamily: font, borderRadius: 0 }}
            >
              Yes, clear it
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirm(true)}
            style={{ width: "100%", padding: "12px", background: C.card, border: `1px solid ${C.coral}`, color: C.coral, cursor: "pointer", fontWeight: 700, fontFamily: font, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 0 }}
          >
            <Trash2 size={16} /> Clear all history
          </button>
        )}
      </div>
    </div>
  );
}
