import { useEffect } from "react";
import { BrowserRouter } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { AppProvider } from "@/hooks/app";
import { FocusProvider } from "@/features/focus/FocusProvider";
import { Shell } from "@/components/layout/Shell";
import { Onboarding } from "@/features/onboarding/Onboarding";

export default function App() {
  const settings = useLiveQuery(async () => (await db.settings.get("settings")) ?? null, []);

  // Ask the browser not to evict our data under storage pressure (best effort).
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  if (settings === undefined) {
    return (
      <div className="grid min-h-dvh place-items-center" aria-busy="true">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="Caricamento di Unbeatable" className="size-9 animate-breathe" />
      </div>
    );
  }

  if (!settings || !settings.onboardedAt) return <Onboarding existing={settings} />;

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <AppProvider settings={settings}>
        <FocusProvider>
          <Shell />
        </FocusProvider>
      </AppProvider>
    </BrowserRouter>
  );
}
