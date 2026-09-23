// Recharts views for the Stats and Weight tabs. Loaded lazily by
// CalorieTracker.jsx so the charting library stays out of the first load.
import React from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, ReferenceLine,
  ResponsiveContainer, Cell, Tooltip,
} from "recharts";
import { C, fmt } from "./theme.js";

const tooltipStyle = { borderRadius: 0, border: `1px solid ${C.line}`, fontSize: 12 };

export function CaloriesChart({ series, goal }) {
  return (
    <ResponsiveContainer>
      <BarChart data={series} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.inkSoft }} interval={1} axisLine={{ stroke: C.line }} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: C.inkSoft }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: C.sunSoft }} contentStyle={tooltipStyle} formatter={(v) => [`${fmt(v)} kcal`, "Eaten"]} />
        <ReferenceLine y={goal} stroke={C.teal} strokeDasharray="4 3" strokeWidth={1.5} />
        <Bar dataKey="cals" radius={0}>
          {series.map((d, i) => (
            <Cell key={i} fill={d.cals >= goal ? C.teal : d.cals > 0 ? C.coral : C.line} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WeightChart({ data, unit }) {
  return (
    <ResponsiveContainer>
      <LineChart data={data} margin={{ top: 10, right: 10, left: -14, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.inkSoft }} axisLine={{ stroke: C.line }} tickLine={false} />
        <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 10, fill: C.inkSoft }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} ${unit}`, "Weight"]} />
        <Line type="monotone" dataKey="v" stroke={C.teal} strokeWidth={2.5} dot={{ r: 3, fill: C.teal }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
