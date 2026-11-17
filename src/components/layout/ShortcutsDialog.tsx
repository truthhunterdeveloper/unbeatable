import { Modal } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/misc";
import { useApp } from "@/hooks/app";
import { DOMAIN_NAV, NAV, SETTINGS_NAV } from "./nav";

const GROUPS: { title: string; items: [string[], string][] }[] = [
  {
    title: "Generali",
    items: [
      [["Ctrl", "K"], "Palette comandi e ricerca"],
      [["N"], "Nuova attività"],
      [["?"], "Mostra scorciatoie"],
      [["Ctrl", "Enter"], "Salva il modulo aperto"],
      [["Esc"], "Chiudi la finestra"],
    ],
  },
  {
    title: "Navigazione",
    items: [...NAV, ...DOMAIN_NAV, SETTINGS_NAV].map((n) => [["G", n.key.toUpperCase()], n.label] as [string[], string]),
  },
  {
    title: "Attività",
    items: [
      [["/"], "Cerca attività"],
      [["J"], "Attività successiva"],
      [["K"], "Attività precedente"],
      [["X"], "Completa / riapri la selezionata"],
      [["E"], "Modifica la selezionata"],
      [["M"], "Aggiungi / togli dalla Missione di oggi"],
    ],
  },
  {
    title: "Sessione di lavoro profondo",
    items: [
      [["Space"], "Pausa / riprendi"],
      [["D"], "Annota una distrazione"],
    ],
  },
];

export function ShortcutsDialog() {
  const { shortcuts, setShortcuts } = useApp();
  return (
    <Modal open={shortcuts} onOpenChange={setShortcuts} title="Scorciatoie da tastiera" size="lg">
      <div className="grid gap-6 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="eyebrow mb-2">{g.title}</h3>
            <ul className="flex flex-col gap-1.5">
              {g.items.map(([keys, label]) => (
                <li key={label} className="flex items-center justify-between gap-3 text-[13px] text-muted">
                  <span>{label}</span>
                  <span className="flex gap-1">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
