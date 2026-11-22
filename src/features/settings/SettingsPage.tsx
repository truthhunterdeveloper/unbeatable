import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { Music, ArrowLeftRight, Bell, Database, Download, HardDrive, History, Plus, ShieldCheck, Trash2, Upload } from "lucide-react";
import { motivationMinutes } from "@/lib/quotes";
import { introAudioName, removeIntroAudio, saveIntroAudio } from "@/components/AudioPlayer";
import { listSnapshots, mergeSync, shareSyncFile, snapshot, snapshotFile } from "@/db/sync";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { Modal } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useApp } from "@/hooks/app";
import { useHabits, useTasks } from "@/hooks/data";
import { ColorPick } from "@/features/onboarding/Onboarding";
import { DOMAIN_PALETTE } from "@/db/defaults";
import type { Settings } from "@/db/schema";
import { ValidationError, deleteAllData, exportAll, importAll, saveSettings, uid } from "@/db/repo";
import { formatDuration, listTimeZones, sleepMinutes } from "@/lib/date";
import { notificationPermission, requestNotificationPermission } from "@/lib/notify";
import { cn, downloadJSON, errorMessage } from "@/lib/utils";
import { isNative } from "@/lib/native";

export function SettingsPage() {
  const { settings, today } = useApp();
  const toast = useToast();
  const loc = useLocation();
  const [draft, setDraft] = useState<Settings>(settings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const zones = useMemo(() => listTimeZones(), []);
  const tasks = useTasks();
  const habits = useHabits();
  const dataRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => {
    if (loc.hash === "#data") dataRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [loc.hash]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((x) => ({ ...x, [k]: v }));
  const usedDomains = useMemo(() => new Set([...(tasks ?? []).map((t) => t.domain), ...(habits ?? []).map((h) => h.domain)]), [tasks, habits]);

  async function save() {
    try {
      setErrors({});
      await saveSettings({ ...draft, name: draft.name.trim() });
      toast.success("Impostazioni salvate");
    } catch (e) {
      if (e instanceof ValidationError) {
        setErrors(e.fieldErrors);
        toast.error(Object.values(e.fieldErrors)[0]);
      } else toast.error(errorMessage(e));
    }
  }

  const sleep = sleepMinutes(draft.bedTime, draft.wakeTime);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Impostazioni" description="Qui tutto è modificabile. Le modifiche valgono per tutto il sistema." />

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader title="Profilo" />
          <div className="grid gap-4 px-4 pb-4 sm:grid-cols-3">
            <Field label="Nome preferito" error={errors.name}>
              {(p) => <Input {...p} value={draft.name} maxLength={40} onChange={(e) => set("name", e.target.value)} />}
            </Field>
            <Field label="Fuso orario" error={errors.timeZone}>
              {(p) => (
                <Select {...p} value={draft.timeZone} onChange={(e) => set("timeZone", e.target.value)}>
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, " ")}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="La settimana inizia di">
              {(p) => (
                <Select {...p} value={draft.weekStart} onChange={(e) => set("weekStart", Number(e.target.value) as 0 | 1)}>
                  <option value={1}>Lunedì</option>
                  <option value={0}>Domenica</option>
                </Select>
              )}
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Aree di vita" sub="Disattiva un'area per nasconderla dai nuovi elementi. Le aree in uso non si possono eliminare." />
          <ul className="flex flex-col gap-1.5 px-4 pb-3">
            {draft.domains.map((d, idx) => (
              <li key={d.id} className={cn("flex items-center gap-2 rounded-lg border px-2 py-1", d.enabled ? "border-line-strong" : "border-line opacity-55")}>
                <ColorPick color={d.color} onChange={(c) => set("domains", draft.domains.map((x) => (x.id === d.id ? { ...x, color: c } : x)))} />
                <input
                  aria-label="Nome dell'area"
                  value={d.label}
                  maxLength={32}
                  onChange={(e) => set("domains", draft.domains.map((x) => (x.id === d.id ? { ...x, label: e.target.value } : x)))}
                  className="h-8 min-w-0 flex-1 bg-transparent text-[13px] focus:outline-none"
                />
                {errors[`domains.${idx}.label`] ? <span className="text-xs text-danger">{errors[`domains.${idx}.label`]}</span> : null}
                <Button size="sm" variant="ghost" onClick={() => set("domains", draft.domains.map((x) => (x.id === d.id ? { ...x, enabled: !x.enabled } : x)))}>
                  {d.enabled ? "Disattiva" : "Attiva"}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Elimina ${d.label}`}
                  disabled={usedDomains.has(d.id) || draft.domains.length <= 1}
                  title={usedDomains.has(d.id) ? "Usata da attività o abitudini: disattivala invece" : "Elimina"}
                  onClick={() => set("domains", draft.domains.filter((x) => x.id !== d.id))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          {errors.domains ? <p className="px-4 pb-2 text-xs text-danger">{errors.domains}</p> : null}
          <div className="px-4 pb-4">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => set("domains", [...draft.domains, { id: `d-${uid().slice(0, 8)}`, label: "Nuova area", color: DOMAIN_PALETTE[draft.domains.length % DOMAIN_PALETTE.length], enabled: true }])}
            >
              <Plus /> Aggiungi area
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Ritmo e focus" />
          <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
            <Field label="Sveglia abituale" error={errors.wakeTime}>
              {(p) => <Input {...p} type="time" value={draft.wakeTime} onChange={(e) => set("wakeTime", e.target.value)} />}
            </Field>
            <Field
              label="Ora abituale di andare a letto"
              error={errors.bedTime}
              hint={<span className={sleep < 480 ? "text-warn" : ""}>{formatDuration(sleep)} di sonno previste{sleep < 480 ? " — sotto le 8–10 h raccomandate per gli adolescenti" : ""}</span>}
            >
              {(p) => <Input {...p} type="time" value={draft.bedTime} onChange={(e) => set("bedTime", e.target.value)} />}
            </Field>
            <Field label="Blocco di focus (min)" error={errors.focusMinutes}>
              {(p) => <Input {...p} type="number" min={5} max={180} value={draft.focusMinutes} onChange={(e) => set("focusMinutes", Number(e.target.value))} />}
            </Field>
            <Field label="Pausa (min)" error={errors.breakMinutes}>
              {(p) => <Input {...p} type="number" min={1} max={60} value={draft.breakMinutes} onChange={(e) => set("breakMinutes", Number(e.target.value))} />}
            </Field>
            <Field label="Sessione lunga (min)" error={errors.longFocusMinutes}>
              {(p) => <Input {...p} type="number" min={30} max={240} value={draft.longFocusMinutes} onChange={(e) => set("longFocusMinutes", Number(e.target.value))} />}
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Deen · privacy" />
          <label className="flex cursor-pointer items-start gap-3 px-4 pb-4">
            <input type="checkbox" className="mt-0.5 accent-[#d4d4d4]" checked={draft.prayerTracking !== false} onChange={(e) => set("prayerTracking", e.target.checked)} />
            <span>
              <span className="block text-[13px] text-fg">Tracciamento delle preghiere</span>
              <span className="block text-xs text-subtle">Facoltativo e privato. Disattivandolo, la griglia delle preghiere viene nascosta; i dati già registrati restano finché non li elimini.</span>
            </span>
          </label>
        </Card>

        <NotificationsCard />
        <AudioCard />

        <div ref={dataRef} id="data" className="scroll-mt-8">
          <DataCard today={today} />
        </div>
      </div>

      {dirty ? (
        <div className="fixed inset-x-0 bottom-16 z-40 flex justify-center px-4 md:bottom-6 md:pl-[240px]">
          <div className="flex animate-rise items-center gap-3 rounded-xl border border-line-strong bg-elevated/95 py-2 pr-2 pl-4 shadow-2xl shadow-black/50 backdrop-blur">
            <span className="text-[13px] text-muted">Modifiche non salvate</span>
            <Button variant="ghost" size="sm" onClick={() => setDraft(settings)}>
              Scarta
            </Button>
            <Button variant="primary" size="sm" onClick={save}>
              Salva
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NotificationsCard() {
  const { settings } = useApp();
  const toast = useToast();
  const [perm, setPerm] = useState(notificationPermission());

  async function toggle() {
    try {
      if (!settings.notifications) {
        const p = await requestNotificationPermission();
        setPerm(p);
        if (p !== "granted") {
          toast.info(p === "unsupported" ? "Questo browser non supporta le notifiche." : "Il browser ha bloccato le notifiche. Consentile nelle impostazioni del sito per attivarle.");
          return;
        }
      }
      await saveSettings({ ...settings, notifications: !settings.notifications });
      toast.success(settings.notifications ? "Notifiche disattivate" : "Notifiche attivate");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Card>
      <CardHeader title="Notifiche" icon={<Bell />} />
      <div className="flex flex-wrap items-center gap-4 px-4 pb-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-fg">Timer di focus e promemoria abitudini</p>
          <p className="mt-0.5 text-xs leading-relaxed text-subtle">
            {isNative
              ? "Notifiche native di iOS: arrivano anche con l'app chiusa (fine sessione, fine pausa, promemoria abitudini)."
              : "Nel browser le notifiche funzionano solo con Unbeatable aperto in una scheda."}{" "}
            {isNative ? null : <>Permesso del browser: <span className="text-muted">{perm}</span>.</>}
          </p>
        </div>
        <Button variant={settings.notifications ? "secondary" : "primary"} size="sm" onClick={toggle}>
          {settings.notifications ? "Disattiva" : "Attiva"}
        </Button>
        <MotivationSettings />
      </div>
    </Card>
  );
}

function DataCard({ today }: { today: string }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<unknown | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage
      ?.estimate?.()
      .then((e) => e.usage != null && setUsage(`${(e.usage / 1024).toFixed(0)} KB`))
      .catch(() => {});
  }, []);

  async function doExport() {
    try {
      const data = await exportAll();
      downloadJSON(`unbeatable-${today}.json`, data);
      toast.success("Esportazione scaricata");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const text = await f.text();
      setImportFile(JSON.parse(text));
    } catch {
      toast.error("Il file non è un JSON valido.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader title="Dati e privacy" icon={<Database />} />
      <div className="flex flex-col gap-4 px-4 pb-4">
        <div className="flex gap-3 rounded-xl border border-line bg-white/[0.015] p-3.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" />
          <div className="text-xs leading-relaxed text-subtle">
            <p>
              I dati restano su questo dispositivo: nessun server, nessun account, nessun tracker. Ogni giorno viene salvato un backup automatico, e un altro prima di ogni importazione, sincronizzazione o eliminazione.
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <HardDrive className="size-3.5" />
              {persisted === true ? <Badge tone="ok">Archiviazione persistente concessa</Badge> : persisted === false ? <Badge tone="warn">Il browser potrebbe eliminare i dati se lo spazio scarseggia</Badge> : <Badge>Persistenza sconosciuta</Badge>}
              {usage ? <span>Spazio usato: {usage}</span> : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={doExport}>
            <Download /> Esporta tutti i dati (JSON)
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <Upload /> Importa da un'esportazione…
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button variant="danger" className="sm:ml-auto" onClick={() => setEraseOpen(true)}>
            <Trash2 /> Elimina tutti i dati
          </Button>
        </div>
      </div>

      <SyncPanel />
      <Modal
        open={importFile != null}
        onOpenChange={(o) => !o && setImportFile(null)}
        title="Sostituire tutti i dati con questa esportazione?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportFile(null)}>
              Annulla
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  await snapshot("prima dell'importazione");
                  const { counts } = await importAll(importFile);
                  setImportFile(null);
                  toast.success(`Importati: ${counts.tasks ?? 0} attività, ${counts.habits ?? 0} abitudini, ${counts.focusSessions ?? 0} sessioni`);
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              Sostituisci i dati
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted">
          Ogni record viene prima validato. Se il file è valido, i dati attuali su questo dispositivo vengono sostituiti dal suo contenuto. Se qualcosa non è valido, non cambia nulla.
        </p>
      </Modal>

      <Modal
        open={eraseOpen}
        onOpenChange={(o) => {
          setEraseOpen(o);
          setConfirmText("");
        }}
        title="Eliminare definitivamente tutti i dati?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEraseOpen(false)}>
              Annulla
            </Button>
            <Button
              variant="danger"
              disabled={confirmText !== "DELETE"}
              onClick={async () => {
                try {
                  await snapshot("prima dell'eliminazione");
                  await deleteAllData();
                  setEraseOpen(false);
                  history.replaceState(null, "", import.meta.env.BASE_URL);
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              Elimina tutto
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-[13px] leading-relaxed text-muted">
          <p>Cancella ogni attività, abitudine, registrazione, sessione di focus, piano e impostazione di Unbeatable su questo dispositivo. Non si può annullare. Viene salvato un backup automatico prima, recuperabile da "Backup automatici".</p>
          <Field label={<>Scrivi <span className="font-mono text-fg">DELETE</span> per confermare</>}>
            {(p) => <Input {...p} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />}
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

function SyncPanel() {
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [snaps, setSnaps] = useState<{ id?: number; at: number; reason: string }[]>([]);
  const [restore, setRestore] = useState<number | null>(null);
  const last = (() => {
    try {
      return localStorage.getItem("dos:lastSync");
    } catch {
      return null;
    }
  })();
  const reload = () => listSnapshots().then(setSnaps).catch(() => {});
  useEffect(() => {
    reload();
  }, []);

  async function onMerge(f: File | undefined) {
    if (!f) return;
    try {
      const r = await mergeSync(JSON.parse(await f.text()));
      toast.success(`Sincronizzato: ${r.added} nuovi, ${r.updated} aggiornati, ${r.removed} eliminati`);
      reload();
    } catch (e) {
      toast.error(e instanceof SyntaxError ? "Il file non è un JSON valido." : errorMessage(e));
    } finally {
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4 border-t border-line px-4 pt-4 pb-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-medium text-fg">
          <ArrowLeftRight className="size-4 text-subtle" /> Sincronizza iPhone e PC
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-subtle">
          1. Sul dispositivo con le modifiche premi <b className="text-muted">Invia file di sync</b> (su iPhone: AirDrop o salva su iCloud Drive). 2. Sull'altro dispositivo premi <b className="text-muted">Unisci file di sync</b>. Per
          ogni elemento vince la versione più recente; le eliminazioni vengono trasferite; nulla viene sovrascritto alla cieca. Fallo in entrambe le direzioni per avere gli stessi dati ovunque.
        </p>
        {last ? <p className="mt-1 text-xs text-faint">Ultima sincronizzazione: {new Date(last).toLocaleString("it-IT")}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() =>
              shareSyncFile().catch((e) => {
                if (!/cancel/i.test(String(e))) toast.error(errorMessage(e));
              })
            }
          >
            <Upload /> Invia file di sync
          </Button>
          <Button onClick={() => ref.current?.click()}>
            <Download /> Unisci file di sync…
          </Button>
          <input ref={ref} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onMerge(e.target.files?.[0])} />
        </div>
      </div>
      <div>
        <h3 className="flex items-center gap-2 text-sm font-medium text-fg">
          <History className="size-4 text-subtle" /> Backup automatici
        </h3>
        {snaps.length === 0 ? (
          <p className="mt-1 text-xs text-subtle">Nessun backup ancora. Il primo viene creato automaticamente.</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-line rounded-lg border border-line">
            {snaps.slice(0, 8).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                <span className="min-w-0 truncate text-muted">
                  {new Date(s.at).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })} · <span className="text-subtle">{s.reason}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => setRestore(s.id ?? null)}>
                  Ripristina
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal
        open={restore != null}
        onOpenChange={(o) => !o && setRestore(null)}
        title="Ripristinare questo backup?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRestore(null)}>
              Annulla
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  const file = await snapshotFile(restore!);
                  await snapshot("prima del ripristino");
                  await importAll(file);
                  setRestore(null);
                  toast.success("Backup ripristinato");
                  reload();
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              Ripristina
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted">I dati attuali vengono sostituiti da quelli del backup. Prima viene salvato un backup dello stato attuale, quindi puoi sempre tornare indietro.</p>
      </Modal>
    </div>
  );
}

function AudioCard() {
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    introAudioName().then(setName).catch(() => {});
  }, []);
  return (
    <Card>
      <CardHeader title="Audio di apertura" icon={<Music />} />
      <div className="flex flex-col gap-3 px-4 pb-4 text-xs leading-relaxed text-subtle">
        <p>Parte in automatico quando apri l'app. Puoi metterlo in pausa o fermarlo dal pulsante in basso a destra. Il file resta solo su questo dispositivo.</p>
        <p className="text-muted">{name ? `Audio attuale: ${name}` : "Nessun audio scelto."}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => ref.current?.click()}>
            <Upload /> {name ? "Cambia audio…" : "Scegli audio…"}
          </Button>
          {name ? (
            <Button
              variant="ghost"
              onClick={async () => {
                await removeIntroAudio();
                setName(null);
              }}
            >
              <Trash2 /> Rimuovi
            </Button>
          ) : null}
          <input
            ref={ref}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                await saveIntroAudio(f);
                setName(f.name);
                toast.success("Audio salvato");
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                e.target.value = "";
              }
            }}
          />
        </div>
      </div>
    </Card>
  );
}

function MotivationSettings() {
  const { settings } = useApp();
  const toast = useToast();
  const save = async (patch: Partial<Settings>, msg = "Salvato") => {
    try {
      await saveSettings({ ...settings, ...patch });
      toast.success(msg);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const from = settings.motivationFrom ?? settings.wakeTime;
  const to = settings.motivationTo ?? settings.bedTime;
  return (
    <div className="flex w-full flex-col gap-3 border-t border-line pt-3">
      <div>
        <p className="text-[13px] text-fg">Notifiche motivazionali</p>
        <p className="mt-0.5 text-xs text-subtle">Frasi Comeback e ayat. Nell'app installata da Xcode arrivano anche ad app chiusa; nella versione web compaiono mentre l'app è aperta.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Frequenza">
          {(p) => (
            <Select {...p} value={String(motivationMinutes(settings))} onChange={(e) => save({ motivationMinutes: Number(e.target.value) }, "Frequenza salvata")}>
              <option value="10">Ogni 10 minuti</option>
              <option value="15">Ogni 15 minuti</option>
              <option value="30">Ogni 30 minuti</option>
              <option value="60">Ogni ora</option>
              <option value="120">Ogni 2 ore</option>
              <option value="180">Ogni 3 ore</option>
              <option value="240">Ogni 4 ore</option>
              <option value="0">Disattivate</option>
            </Select>
          )}
        </Field>
        <Field label="Dalle">
          {(p) => <Input {...p} type="time" value={from} onChange={(e) => e.target.value && e.target.value < to && save({ motivationFrom: e.target.value }, "Orario salvato")} />}
        </Field>
        <Field label="Alle">
          {(p) => <Input {...p} type="time" value={to} onChange={(e) => e.target.value && e.target.value > from && save({ motivationTo: e.target.value }, "Orario salvato")} />}
        </Field>
      </div>
      <label className="flex items-start gap-2.5 text-[13px] text-fg">
        <input type="checkbox" className="mt-0.5 accent-[#d4d4d4]" checked={settings.blockChecks !== false} onChange={(e) => save({ blockChecks: e.target.checked })} />
        <span>
          Check dei blocchi <span className="block text-xs text-subtle">All'inizio di ogni blocco del Planner (tranne scuola e pause) ti chiede "Lo stai facendo?" con Sì / No.</span>
        </span>
      </label>
    </div>
  );
}
