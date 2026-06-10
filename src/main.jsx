import React from "react";
import { createRoot } from "react-dom/client";
import CalorieTracker from "../CalorieTracker.jsx";

const el = document.getElementById("root");
createRoot(el).render(React.createElement(CalorieTracker));

// register the service worker so the app installs and works offline
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
