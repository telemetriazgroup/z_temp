import { createRoot } from "react-dom/client";
import { ensureBasenameTrailingSlash } from "./app/lib/basenameUrl";
import App from "./app/App.tsx";
import "./styles/index.css";

ensureBasenameTrailingSlash();

createRoot(document.getElementById("root")!).render(<App />);
