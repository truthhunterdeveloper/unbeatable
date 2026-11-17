import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db/db";

/** The API key lives only on this device: never exported, never synced. */
const KEY = "dos:aiKey";
export function getAiKey(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}
export function setAiKey(v: string) {
  try {
    if (v) localStorage.setItem(KEY, v.trim());
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** A compact snapshot of the user's data so the coach answers about their real situation. */
export async function buildContext(today: string): Promise<string> {
  const [settings, tasks, habits, goals, records] = await Promise.all([
    db.settings.get("settings"),
    db.tasks.where("status").notEqual("done").toArray(),
    db.habits.toArray(),
    db.goals.where("status").equals("active").toArray(),
    db.records.toArray(),
  ]);
  const subjects = new Map(records.filter((r) => r.type === "subject").map((r) => [r.id, String(r.data.name)]));
  const line = (o: Record<string, unknown>) =>
    Object.entries(o)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  const parts = [
    `Oggi: ${today}. Nome: ${settings?.name ?? "utente"}. Modalità: ${settings?.mode ?? "standard"}. Sveglia ${settings?.wakeTime}, letto ${settings?.bedTime}.`,
    `Materie: ${[...records.filter((r) => r.type === "subject")].map((r) => `${r.data.name} (priorità ${r.data.priority}, difficoltà ${r.data.difficulty}/5${r.data.target ? `, obiettivo ${r.data.target}` : ""})`).join("; ") || "nessuna"}.`,
    `Attività aperte:\n${tasks.slice(0, 40).map((t) => "- " + line({ titolo: t.title, area: t.domain, scadenza: t.dueDate, importante: t.important ? "sì" : null })).join("\n") || "nessuna"}`,
    `Abitudini: ${habits.filter((h) => !h.archived).map((h) => h.name).join(", ") || "nessuna"}.`,
    `Obiettivi attivi: ${goals.map((g) => `${g.title} (${g.domain})`).join("; ") || "nessuno"}.`,
    `Esami/verifiche e voti:\n${records
      .filter((r) => r.type === "exam" || r.type === "grade")
      .slice(-30)
      .map((r) => `- ${r.type} ${r.date} ${subjects.get(String(r.data.subjectId)) ?? ""} ${line(Object.fromEntries(Object.entries(r.data).filter(([k]) => k !== "subjectId")))}`)
      .join("\n") || "nessuno"}`,
  ];
  return parts.join("\n\n");
}

/** Personal profile ("Su di me"), kept only on this device so it never ends up in the public code. */
const PROFILE = "dos:aiProfile";
export function getProfile(): string {
  try {
    return localStorage.getItem(PROFILE) ?? "";
  } catch {
    return "";
  }
}
export function setProfile(v: string) {
  try {
    localStorage.setItem(PROFILE, v);
  } catch {
    /* ignore */
  }
}

const SYSTEM = `Sei il coach personale dentro l'app Unbeatable: tutor per la scuola e coach per sport, business, fede e organizzazione. Il profilo dell'utente è più sotto.
Rispondi sempre in italiano, in modo diretto e concreto. Per la scuola: spiega i concetti passo per passo, fai esempi, crea esercizi e interrogazioni di prova, correggi i suoi testi; aiutalo a capire, non a copiare (per compiti da consegnare guidalo invece di scrivere tutto al posto suo). Per il resto (calcio, business, Deen, organizzazione, motivazione) dai consigli pratici e sostenibili: niente sensi di colpa, il riposo conta. Su temi religiosi resta rispettoso e suggerisci di chiedere a un imam per questioni di fiqh. Su salute o infortuni consiglia un medico. Usa i suoi dati qui sotto quando servono per pianificare.`;

export type ChatMsg = { role: "user" | "assistant"; content: string };

export async function askCoach(history: ChatMsg[], context: string, onText: (t: string) => void, signal?: AbortSignal): Promise<string> {
  const key = getAiKey();
  if (!key) throw new Error("Inserisci prima la chiave API.");
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  try {
    const stream = client.messages.stream(
      {
        model: "claude-opus-5-5",
        max_tokens: 16000,
        output_config: { effort: "medium" },
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
          { type: "text", text: `Dati attuali dell'utente:\n${context}` },
        ],
        messages: history.slice(-30),
      },
      { signal },
    );
    stream.on("text", (_d, snapshot) => onText(snapshot));
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new Error("Il coach non può rispondere a questa richiesta.");
    return msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("Chiave API non valida.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("Troppe richieste: riprova tra poco.");
    if (e instanceof Anthropic.APIConnectionError) throw new Error("Nessuna connessione a internet.");
    if (e instanceof Anthropic.APIError) throw new Error(`Errore del servizio AI (${e.status}).`);
    throw e;
  }
}
