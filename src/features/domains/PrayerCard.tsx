import { useState } from "react";
import { MapPin, Moon } from "lucide-react";
import { useApp } from "@/hooks/app";
import { saveSettings } from "@/db/repo";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { hm, prayerTimes } from "@/lib/prayer";
import { cn, errorMessage } from "@/lib/utils";

/** Today's five prayer times for the saved location, with the next one highlighted. */
export function PrayerCard({ className }: { className?: string }) {
  const { settings, nowMin } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  function locate() {
    if (!navigator.geolocation) return toast.error("Posizione non disponibile su questo dispositivo.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          await saveSettings({ ...settings, prayerLat: Math.round(p.coords.latitude * 100) / 100, prayerLon: Math.round(p.coords.longitude * 100) / 100 });
          toast.success("Orari delle preghiere impostati per la tua zona");
        } catch (e) {
          toast.error(errorMessage(e));
        } finally {
          setBusy(false);
        }
      },
      () => {
        setBusy(false);
        toast.error("Permesso di posizione negato. Consentilo nelle impostazioni del telefono.");
      },
      { timeout: 15000 },
    );
  }

  if (settings.prayerLat == null || settings.prayerLon == null) {
    return (
      <Card className={cn("flex flex-wrap items-center justify-between gap-3 p-4", className)}>
        <p className="text-[13px] text-muted">Imposta la tua zona per avere gli orari delle 5 salah e un avviso a ogni preghiera.</p>
        <Button size="sm" onClick={locate} disabled={busy}>
          <MapPin /> Usa la mia posizione
        </Button>
      </Card>
    );
  }
  const times = prayerTimes(settings.prayerLat, settings.prayerLon, new Date());
  const next = times.find((t) => t.at.getHours() * 60 + t.at.getMinutes() > nowMin);
  return (
    <Card className={className}>
      <CardHeader
        title="Orari delle preghiere"
        icon={<Moon />}
        action={
          <button type="button" onClick={locate} className="text-xs text-subtle hover:text-fg" disabled={busy}>
            Aggiorna zona
          </button>
        }
      />
      <div className="grid grid-cols-5 gap-1 px-4 pb-4 text-center">
        {times.map((t) => (
          <div key={t.key} className={cn("rounded-lg border px-1 py-2", t === next ? "border-ok/50 bg-ok/10" : "border-line")}>
            <div className="text-[11px] text-subtle">{t.name}</div>
            <div className="tabular text-sm text-fg">{hm(t.at)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
