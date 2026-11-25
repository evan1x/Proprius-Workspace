import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme, loadTheme } from "./services/theme";
import { applyUiScale, loadUiScale } from "./services/uiScale";
import "./index.css";

applyTheme(loadTheme());
applyUiScale(loadUiScale());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
