import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AlertWindow } from "./components/AlertWindow";
import { EffectWindow } from "./components/EffectWindow";
import { WidgetWindow } from "./components/WidgetWindow";
import { isAlertWindow, isEffectWindow, isWidgetWindow } from "./lib/desktop";
import { followInsets } from "./lib/insets";
import "./styles.css";

// The Mac app's mini timer, end-of-phase card and effect load this same page
// in windows of their own.
followInsets();

const Root = isWidgetWindow ? WidgetWindow : isAlertWindow ? AlertWindow : isEffectWindow ? EffectWindow : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
