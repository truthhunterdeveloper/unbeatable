import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { ToastProvider } from "@/components/ui/toast";
import { initNative } from "@/lib/native";
import { dailyBackup, requestPersistence } from "@/db/sync";

initNative();
// Offline copy + automatic updates: when a new version is published, it is
// downloaded in the background and applied on the next app open.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}
void requestPersistence();
setTimeout(() => void dailyBackup(), 3000);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary fullscreen>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
