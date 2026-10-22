import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { WidgetWindow } from "./components/WidgetWindow";
import { isWidgetWindow } from "./lib/desktop";
import "./styles.css";

// The Mac app's mini timer loads this same page in a window of its own.
const Root = isWidgetWindow ? WidgetWindow : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
