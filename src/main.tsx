import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./theme.css";
import "./styles.css";
import "./components/Dashboard.css";
import "./components/Cozy.css";
import "./components/Workspace.css";
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
