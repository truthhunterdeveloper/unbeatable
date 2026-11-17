import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useApp } from "@/hooks/app";
import { db } from "@/db/db";
import { ValidationError, deleteSleep, upsertSleep } from "@/db/repo";
import { formatDuration, sleepMinutes } from "@/lib/date";
import { errorMessage } from "@/lib/utils";

export function SleepDialog() {
  const { sleepDialog, setSleepDialog, settings, today } = useApp();
  const toast = useToast();
  const [date, setDate] = useState(today);
  const existing = useLiveQuery(() => db.sleepLogs.get(date), [date]);
  const [bed, setBed] = useState(settings.bedTime);
  const [wake, setWake] = useState(settings.wakeTime);
  const [quality, setQuality] = useState<string>("none");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (sleepDialog) setDate(today);
  }, [sleepDialog, today]);

  useEffect(() => {
    setBed(existing?.bedTime ?? settings.bedTime);
    setWake(existing?.wakeTime ?? settings.wakeTime);
    setQuality(existing?.quality ? String(existing.quality) : "none");
    setErrors({});
    setFormError(null);
  }, [existing, settings.bedTime, settings.wakeTime, sleepDialog]);

  const duration = /^\d\d:\d\d$/.test(bed) && /^\d\d:\d\d$/.test(wake) ? sleepMinutes(bed, wake) : null;

  async function save() {
    try {
      await upsertSleep({ date, bedTime: bed, wakeTime: wake, quality: quality === "none" ? null : Number(quality) });
      toast.success("Sonno registrato");
      setSleepDialog(false);
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.fieldErrors);
      else setFormError(errorMessage(e));
    }
  }

  return (
    <Modal
      open={sleepDialog}
      onOpenChange={setSleepDialog}
      title="Registra il sonno"
      description="Registra quando hai dormito davvero. Gli adolescenti hanno bisogno in genere di 8–10 ore: il recupero fa parte della prestazione."
      size="sm"
      onSubmit={save}
      footer={
        <>
          {existing ? (
            <Button
              variant="ghost"
              className="mr-auto text-danger hover:text-danger"
              onClick={async () => {
                await deleteSleep(date);
                toast.info("Registrazione del sonno rimossa");
                setSleepDialog(false);
              }}
            >
              Rimuovi
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => setSleepDialog(false)}>
            Annulla
          </Button>
          <Button variant="primary" type="submit">
            Salva
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormError message={formError} />
        <Field label="Mattina del" error={errors.date}>
          {(p) => <Input {...p} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sono andato a dormire" error={errors.bedTime}>
            {(p) => <Input {...p} type="time" value={bed} onChange={(e) => setBed(e.target.value)} />}
          </Field>
          <Field label="Mi sono svegliato" error={errors.wakeTime}>
            {(p) => <Input {...p} type="time" value={wake} onChange={(e) => setWake(e.target.value)} />}
          </Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Quanto ti senti riposato? (facoltativo)</span>
          <Segmented
            label="Qualità del sonno"
            value={quality}
            onChange={setQuality}
            className="w-full"
            options={[
              { value: "none", label: "—" },
              { value: "1", label: "1" },
              { value: "2", label: "2" },
              { value: "3", label: "3" },
              { value: "4", label: "4" },
              { value: "5", label: "5" },
            ]}
          />
        </div>
        {duration != null ? (
          <p className="text-xs text-subtle">
            Durata: <span className="font-medium text-fg tabular">{formatDuration(duration)}</span>
            {duration < 480 ? <span className="text-warn"> · below 8 hours</span> : null}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
