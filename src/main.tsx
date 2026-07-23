import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { AccessApp } from "./access/AccessApp";

// Lot 2B-RC1-SEC1-A — la fenêtre « access » (verrou local) ne charge jamais
// AppDataProvider ni la base SQLite métier : seule la fenêtre « main » le fait.
const isAccessWindow = getCurrentWindow().label === "access";
const RootComponent = isAccessWindow ? AccessApp : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);
