/**
 * Domain record registry. One definition per record type drives:
 *   - the Zod schema used to validate `data` before any write,
 *   - the generated form,
 *   - list summaries.
 * Keeping all three in one place means they can't drift apart.
 */
import { z } from "zod";

export type FieldKind = "text" | "textarea" | "number" | "select" | "rating" | "scale10" | "multi" | "bool" | "ref";

export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** For `ref`: the record type to choose from (e.g. a subject or project). */
  refType?: string;
  min?: number;
  max?: number;
  placeholder?: string;
  hint?: string;
  /** Default value for new records. */
  initial?: unknown;
};

export type RecordTypeDef = {
  type: string;
  label: string;
  /** Singular noun for buttons: "Log training". */
  noun: string;
  dateLabel: string;
  fields: FieldDef[];
  /** Short one-line summary for lists. */
  summary: (d: Record<string, unknown>, refLabel: (id: unknown) => string) => string;
  title: (d: Record<string, unknown>, refLabel: (id: unknown) => string) => string;
};

const opts = (...xs: [string, string][]) => xs.map(([value, label]) => ({ value, label }));
const s = (v: unknown) => (v == null || v === "" ? "" : String(v));
const join = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" · ");

export const FOOTBALL_SKILLS = opts(
  ["finishing", "Finalizzazione"],
  ["weak-foot", "Piede debole"],
  ["first-touch", "Primo controllo"],
  ["passing", "Passaggi"],
  ["decision-making", "Scelte di gioco"],
  ["speed", "Velocità"],
  ["agility", "Agilità"],
  ["endurance", "Resistenza"],
  ["defending", "Difesa"],
  ["heading", "Colpo di testa"],
);

const RATING_HINT = "1 = scarso · 5 = eccellente";

export const RECORD_TYPES: Record<string, RecordTypeDef> = {
  /* ── Deen ── */
  prayer: {
    type: "prayer",
    label: "Preghiere",
    noun: "preghiere",
    dateLabel: "Data",
    fields: ["fajr", "dhuhr", "asr", "maghrib", "isha"].map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), kind: "bool" as const })),
    title: () => "Preghiere",
    summary: (d) => `${["fajr", "dhuhr", "asr", "maghrib", "isha"].filter((k) => d[k]).length}/5`,
  },
  quran: {
    type: "quran",
    label: "Lettura del Corano",
    noun: "lettura",
    dateLabel: "Data",
    fields: [
      { key: "pages", label: "Pagine lette", kind: "number", required: true, min: 0, max: 604 },
      { key: "minutes", label: "Minuti", kind: "number", min: 0, max: 600 },
      { key: "portion", label: "Porzione", kind: "text", placeholder: "es. Al-Kahf 1–30" },
      { key: "notes", label: "Nota", kind: "textarea" },
    ],
    title: (d) => s(d.portion) || "Lettura del Corano",
    summary: (d) => join(`${s(d.pages)} pagine`, d.minutes ? `${s(d.minutes)} min` : null),
  },
  hifz: {
    type: "hifz",
    label: "Memorizzazione",
    noun: "memorizzazione",
    dateLabel: "Data",
    fields: [
      { key: "surah", label: "Sura", kind: "text", required: true },
      { key: "ayahs", label: "Versetti", kind: "text", placeholder: "es. 1–5" },
      { key: "kind", label: "Tipo", kind: "select", required: true, options: opts(["new", "Nuova memorizzazione"], ["revision", "Ripasso"]), initial: "new" },
      { key: "strength", label: "Quanto è solida?", kind: "rating", hint: "1 = incerta · 5 = solida" },
      { key: "notes", label: "Nota", kind: "textarea" },
    ],
    title: (d) => join(s(d.surah), d.ayahs ? `versetti ${s(d.ayahs)}` : null),
    summary: (d) => join(d.kind === "revision" ? "Ripasso" : "Nuova", d.strength ? `solidità ${s(d.strength)}/5` : null),
  },
  islamicStudy: {
    type: "islamicStudy",
    label: "Studio islamico",
    noun: "studio",
    dateLabel: "Data",
    fields: [
      { key: "topic", label: "Argomento", kind: "text", required: true },
      { key: "source", label: "Fonte", kind: "text", placeholder: "Libro, insegnante, lezione" },
      { key: "minutes", label: "Minuti", kind: "number", min: 0, max: 600 },
      { key: "takeaway", label: "Insegnamento principale", kind: "textarea" },
    ],
    title: (d) => s(d.topic),
    summary: (d) => join(s(d.source), d.minutes ? `${s(d.minutes)} min` : null),
  },
  deenReflection: {
    type: "deenReflection",
    label: "Riflessioni",
    noun: "riflessione",
    dateLabel: "Data",
    fields: [{ key: "text", label: "Riflessione", kind: "textarea", required: true, placeholder: "Privato. Solo tu puoi vederlo." }],
    title: (d) => s(d.text).slice(0, 80),
    summary: () => "",
  },

  /* ── Football ── */
  training: {
    type: "training",
    label: "Allenamento",
    noun: "allenamento",
    dateLabel: "Data",
    fields: [
      {
        key: "sessionType",
        label: "Tipo di sessione",
        kind: "select",
        required: true,
        options: opts(["team", "Allenamento di squadra"], ["technical", "Tecnica individuale"], ["strength", "Forza / palestra"], ["conditioning", "Condizionamento"], ["recovery", "Sessione di recupero"]),
        initial: "team",
      },
      { key: "duration", label: "Durata (min)", kind: "number", required: true, min: 1, max: 300 },
      { key: "rpe", label: "Intensità percepita (RPE)", kind: "scale10", required: true, hint: "1 = molto facile · 10 = massimale" },
      { key: "focus", label: "Focus tecnico", kind: "multi", options: FOOTBALL_SKILLS },
      { key: "assessment", label: "Autovalutazione", kind: "rating", hint: RATING_HINT },
      { key: "notes", label: "Nota", kind: "textarea" },
    ],
    title: (d) => RECORD_TYPES.training.fields[0].options!.find((o) => o.value === d.sessionType)?.label ?? "Allenamento",
    summary: (d) => join(`${s(d.duration)} min`, `RPE ${s(d.rpe)}`, Array.isArray(d.focus) && d.focus.length ? (d.focus as string[]).map((f) => FOOTBALL_SKILLS.find((x) => x.value === f)?.label ?? f).join(", ") : null),
  },
  match: {
    type: "match",
    label: "Partite",
    noun: "partita",
    dateLabel: "Data partita",
    fields: [
      { key: "opponent", label: "Avversario", kind: "text", required: true },
      { key: "competition", label: "Competizione", kind: "text" },
      { key: "minutes", label: "Minuti giocati", kind: "number", min: 0, max: 130 },
      { key: "rpe", label: "Intensità percepita (RPE)", kind: "scale10", hint: "Conta nel carico di allenamento" },
      { key: "goals", label: "Gol", kind: "number", min: 0, max: 20 },
      { key: "assists", label: "Assist", kind: "number", min: 0, max: 20 },
      { key: "rating", label: "Voto personale", kind: "rating", hint: RATING_HINT },
      { key: "lessons", label: "Lezioni imparate", kind: "textarea", placeholder: "Cosa farai diversamente?" },
    ],
    title: (d) => `vs ${s(d.opponent)}`,
    summary: (d) => join(s(d.competition), d.minutes != null ? `${s(d.minutes)}'` : null, d.goals ? `${s(d.goals)}G` : null, d.assists ? `${s(d.assists)}A` : null),
  },
  refMatch: {
    type: "refMatch",
    label: "Arbitraggio",
    noun: "gara arbitrata",
    dateLabel: "Data partita",
    fields: [
      { key: "competition", label: "Competizione", kind: "text", required: true },
      { key: "role", label: "Ruolo", kind: "select", required: true, options: opts(["referee", "Arbitro"], ["assistant", "Assistente"], ["fourth", "Quarto ufficiale"]), initial: "referee" },
      { key: "objectives", label: "Obiettivi per questa gara", kind: "textarea" },
      { key: "positioning", label: "Posizionamento", kind: "rating", hint: RATING_HINT },
      { key: "communication", label: "Comunicazione", kind: "rating", hint: RATING_HINT },
      { key: "management", label: "Gestione gara", kind: "rating", hint: RATING_HINT },
      { key: "review", label: "Analisi post-gara", kind: "textarea" },
    ],
    title: (d) => s(d.competition),
    summary: (d) => join(RECORD_TYPES.refMatch.fields[1].options!.find((o) => o.value === d.role)?.label, ["positioning", "communication", "management"].every((k) => d[k]) ? `media ${(((Number(d.positioning) + Number(d.communication) + Number(d.management)) / 3) || 0).toFixed(1)}/5` : null),
  },

  /* ── Business ── */
  project: {
    type: "project",
    label: "Progetti",
    noun: "progetto",
    dateLabel: "Iniziato",
    fields: [
      { key: "name", label: "Nome", kind: "text", required: true },
      { key: "objective", label: "Obiettivo", kind: "textarea", placeholder: "Come si misura il successo?" },
      { key: "status", label: "Stato", kind: "select", required: true, options: opts(["idea", "Idea"], ["building", "In sviluppo"], ["selling", "In vendita"], ["paused", "In pausa"], ["done", "Concluso"]), initial: "idea" },
    ],
    title: (d) => s(d.name),
    summary: (d) => RECORD_TYPES.project.fields[2].options!.find((o) => o.value === d.status)?.label ?? "",
  },
  activity: {
    type: "activity",
    label: "Attività",
    noun: "attività",
    dateLabel: "Data",
    fields: [
      { key: "projectId", label: "Progetto", kind: "ref", refType: "project" },
      {
        key: "kind",
        label: "Attività",
        kind: "select",
        required: true,
        options: opts(["outreach", "Potenziali clienti contattati"], ["followup", "Follow-up inviati"], ["meeting", "Incontri svolti"], ["build", "Sessioni di lavoro sul prodotto"], ["content", "Contenuti pubblicati"], ["learning", "Studio vendite/business"]),
        initial: "outreach",
      },
      { key: "count", label: "Quanti", kind: "number", required: true, min: 1, max: 10000, initial: 1 },
      { key: "note", label: "Nota", kind: "text" },
    ],
    title: (d) => `${s(d.count)} × ${RECORD_TYPES.activity.fields[1].options!.find((o) => o.value === d.kind)?.label.toLowerCase()}`,
    summary: (d, ref) => join(ref(d.projectId), s(d.note)),
  },
  outcome: {
    type: "outcome",
    label: "Risultati",
    noun: "risultato",
    dateLabel: "Data",
    fields: [
      { key: "projectId", label: "Progetto", kind: "ref", refType: "project" },
      {
        key: "kind",
        label: "Risultato",
        kind: "select",
        required: true,
        options: opts(["reply", "Risposte ricevute"], ["meetingBooked", "Incontri fissati"], ["trial", "Prove / progetti pilota avviati"], ["customer", "Clienti acquisiti"], ["shipped", "Rilasci del prodotto"]),
        initial: "meetingBooked",
      },
      { key: "count", label: "Quanti", kind: "number", required: true, min: 1, max: 10000, initial: 1 },
      { key: "note", label: "Nota", kind: "text" },
    ],
    title: (d) => `${s(d.count)} × ${RECORD_TYPES.outcome.fields[1].options!.find((o) => o.value === d.kind)?.label.toLowerCase()}`,
    summary: (d, ref) => join(ref(d.projectId), s(d.note)),
  },
  transaction: {
    type: "transaction",
    label: "Transazioni",
    noun: "transazione",
    dateLabel: "Data",
    fields: [
      { key: "projectId", label: "Progetto", kind: "ref", refType: "project" },
      { key: "kind", label: "Tipo", kind: "select", required: true, options: opts(["income", "Entrata (soldi ricevuti)"], ["expense", "Spesa (soldi spesi)"]), initial: "income" },
      { key: "amount", label: "Importo", kind: "number", required: true, min: 0.01, max: 10_000_000 },
      { key: "currency", label: "Valuta", kind: "text", required: true, initial: "EUR", placeholder: "EUR" },
      { key: "description", label: "Descrizione", kind: "text", required: true, placeholder: "Chi ha pagato / per cosa" },
    ],
    title: (d) => s(d.description),
    summary: (d, ref) => join(`${d.kind === "expense" ? "−" : "+"}${Number(d.amount).toFixed(2)} ${s(d.currency)}`, ref(d.projectId)),
  },
  discovery: {
    type: "discovery",
    label: "Customer discovery",
    noun: "conversazione",
    dateLabel: "Data",
    fields: [
      { key: "projectId", label: "Progetto", kind: "ref", refType: "project" },
      { key: "person", label: "Chi (ruolo, non il nome completo)", kind: "text", required: true, placeholder: "es. studente di quarta, titolare di un bar" },
      { key: "problem", label: "Problema descritto", kind: "textarea" },
      { key: "insight", label: "Intuizione", kind: "textarea" },
      { key: "wouldPay", label: "Pagherebbe?", kind: "select", options: opts(["yes", "Sì"], ["maybe", "Non chiaro"], ["no", "No"]) },
    ],
    title: (d) => s(d.person),
    summary: (d, ref) => join(ref(d.projectId), d.wouldPay ? `pagherebbe: ${({ yes: "sì", maybe: "non chiaro", no: "no" } as Record<string, string>)[s(d.wouldPay)] ?? s(d.wouldPay)}` : null),
  },
  bizReview: {
    type: "bizReview",
    label: "Revisioni settimanali",
    noun: "revisione settimanale",
    dateLabel: "Settimana del",
    fields: [
      { key: "worked", label: "Cosa ha funzionato?", kind: "textarea", required: true },
      { key: "failed", label: "Cosa non ha funzionato?", kind: "textarea" },
      { key: "why", label: "Perché?", kind: "textarea" },
      { key: "next", label: "Cosa cambia la prossima settimana?", kind: "textarea" },
    ],
    title: () => "Revisione business",
    summary: (d) => s(d.next).slice(0, 90),
  },

  /* ── School ── */
  subject: {
    type: "subject",
    label: "Materie",
    noun: "materia",
    dateLabel: "Aggiunta",
    fields: [
      { key: "name", label: "Materia", kind: "text", required: true },
      { key: "priority", label: "Priorità base", kind: "select", required: true, options: opts(["high", "Alta"], ["normal", "Normale"], ["low", "Bassa"]), initial: "normal" },
      { key: "difficulty", label: "Difficoltà attuale", kind: "rating", required: true, hint: "1 = a mio agio · 5 = in difficoltà", initial: 3 },
      { key: "target", label: "Voto obiettivo", kind: "text", placeholder: "es. 8, 9, 85%" },
    ],
    title: (d) => s(d.name),
    summary: (d) => join(`priorità ${({ high: "alta", normal: "normale", low: "bassa" } as Record<string, string>)[s(d.priority)] ?? s(d.priority)}`, `difficoltà ${s(d.difficulty)}/5`, d.target ? `obiettivo ${s(d.target)}` : null),
  },
  exam: {
    type: "exam",
    label: "Esami",
    noun: "esame",
    dateLabel: "Data esame",
    fields: [
      { key: "subjectId", label: "Materia", kind: "ref", refType: "subject", required: true },
      { key: "title", label: "Esame", kind: "text", required: true, placeholder: "es. Verifica di algebra" },
      { key: "topics", label: "Argomenti da ripassare (uno per riga)", kind: "textarea", placeholder: "Equazioni di secondo grado\nSistemi\nTeoremi sulla circonferenza" },
      { key: "target", label: "Obiettivo", kind: "text" },
    ],
    title: (d) => s(d.title),
    summary: (d, ref) => join(ref(d.subjectId), d.target ? `obiettivo ${s(d.target)}` : null),
  },
  grade: {
    type: "grade",
    label: "Voti",
    noun: "voto",
    dateLabel: "Data",
    fields: [
      { key: "subjectId", label: "Materia", kind: "ref", refType: "subject", required: true },
      { key: "title", label: "Verifica", kind: "text", required: true },
      { key: "score", label: "Punteggio", kind: "number", required: true, min: 0, max: 100000 },
      { key: "outOf", label: "Su", kind: "number", required: true, min: 1, max: 100000, initial: 100 },
    ],
    title: (d) => s(d.title),
    summary: (d, ref) => join(ref(d.subjectId), `${s(d.score)}/${s(d.outOf)} (${Math.round((Number(d.score) / Number(d.outOf)) * 100)}%)`),
  },
  mistake: {
    type: "mistake",
    label: "Registro errori",
    noun: "errore",
    dateLabel: "Data",
    fields: [
      { key: "subjectId", label: "Materia", kind: "ref", refType: "subject", required: true },
      { key: "topic", label: "Argomento", kind: "text" },
      { key: "errore", label: "Cosa è andato storto", kind: "textarea", required: true },
      { key: "fix", label: "Procedimento corretto", kind: "textarea", required: true },
      { key: "reviewed", label: "Ripassato", kind: "bool" },
    ],
    title: (d) => s(d.topic) || s(d.mistake).slice(0, 60),
    summary: (d, ref) => join(ref(d.subjectId), d.reviewed ? "ripassato" : "da ripassare"),
  },

  /* ── Weekly review ── */
  weeklyReview: {
    type: "weeklyReview",
    label: "Revisioni settimanali",
    noun: "revisione",
    dateLabel: "Settimana del",
    fields: [
      { key: "worked", label: "Cosa ha funzionato?", kind: "textarea", required: true },
      { key: "failed", label: "Cosa non ha funzionato?", kind: "textarea" },
      { key: "why", label: "Perché?", kind: "textarea" },
      { key: "next", label: "Cosa cambio la prossima settimana?", kind: "textarea" },
    ],
    title: () => "Revisione settimanale",
    summary: (d) => s(d.next).slice(0, 90),
  },

  /* ── Personal development ── */
  blockCheck: {
    type: "blockCheck",
    label: "Check dei blocchi",
    noun: "check",
    dateLabel: "Data",
    fields: [
      { key: "title", label: "Blocco", kind: "text", required: true },
      { key: "answer", label: "Lo stavo facendo?", kind: "select", required: true, options: opts(["yes", "Sì"], ["no", "No"]) },
    ],
    title: (d) => s(d.title),
    summary: (d) => (d.answer === "yes" ? "fatto" : "non fatto"),
  },
  reflection: {
    type: "reflection",
    label: "Riflessioni serali",
    noun: "riflessione",
    dateLabel: "Data",
    fields: [
      { key: "completed", label: "Cosa ho completato?", kind: "textarea", required: true },
      { key: "distracted", label: "Cosa mi ha distratto?", kind: "textarea" },
      { key: "learned", label: "Cosa ho imparato?", kind: "textarea" },
      { key: "improve", label: "Cosa migliorerò domani?", kind: "textarea" },
    ],
    title: (d) => s(d.completed).slice(0, 80),
    summary: (d) => (d.improve ? `Domani: ${s(d.improve).slice(0, 80)}` : ""),
  },
  energy: {
    type: "energy",
    label: "Energia",
    noun: "check-in",
    dateLabel: "Data",
    fields: [
      { key: "energy", label: "Energia", kind: "rating", required: true, hint: "1 = scarico · 5 = pieno di energia", initial: 3 },
      { key: "mood", label: "Umore (facoltativo)", kind: "select", options: opts(["calm", "Calmo"], ["motivated", "Motivato"], ["stressed", "Stressato"], ["low", "Giù"], ["irritable", "Irritabile"]) },
      { key: "note", label: "Nota", kind: "text" },
    ],
    title: (d) => `Energia ${s(d.energy)}/5`,
    summary: (d) => join(s(d.mood), s(d.note)),
  },
  reading: {
    type: "reading",
    label: "Lettura",
    noun: "lettura",
    dateLabel: "Data",
    fields: [
      { key: "title", label: "Libro", kind: "text", required: true },
      { key: "pages", label: "Pagine", kind: "number", required: true, min: 1, max: 2000 },
      { key: "notes", label: "Nota", kind: "textarea" },
    ],
    title: (d) => s(d.title),
    summary: (d) => `${s(d.pages)} pagine`,
  },
  learning: {
    type: "learning",
    label: "Abilità e apprendimento",
    noun: "pratica",
    dateLabel: "Data",
    fields: [
      { key: "skill", label: "Abilità", kind: "text", required: true, placeholder: "es. parlare in pubblico, programmazione" },
      { key: "minutes", label: "Minuti", kind: "number", min: 1, max: 600 },
      { key: "note", label: "Cosa è migliorato?", kind: "text" },
    ],
    title: (d) => s(d.skill),
    summary: (d) => join(d.minutes ? `${s(d.minutes)} min` : null, s(d.note)),
  },
};

function fieldSchema(f: FieldDef): z.ZodType {
  let base: z.ZodType;
  switch (f.kind) {
    case "text":
      base = f.required ? z.string().trim().min(1, `${f.label}: campo obbligatorio`).max(200) : z.string().trim().max(200);
      break;
    case "textarea":
      base = f.required ? z.string().trim().min(1, `${f.label}: campo obbligatorio`).max(4000) : z.string().trim().max(4000);
      break;
    case "number": {
      let n = z.number({ error: `${f.label}: inserisci un numero` }).finite();
      if (f.min != null) n = n.min(f.min, `${f.label}: minimo ${f.min}`);
      if (f.max != null) n = n.max(f.max, `${f.label}: massimo ${f.max}`);
      base = n;
      break;
    }
    case "rating":
      base = z.number().int().min(1).max(5);
      break;
    case "scale10":
      base = z.number().int().min(1).max(10);
      break;
    case "select":
      base = z.enum(f.options!.map((o) => o.value) as [string, ...string[]], { error: `Scegli: ${f.label.toLowerCase()}` });
      break;
    case "multi":
      base = z.array(z.enum(f.options!.map((o) => o.value) as [string, ...string[]]));
      break;
    case "bool":
      base = z.boolean();
      break;
    case "ref":
      base = z.string().min(1, `Scegli: ${f.label.toLowerCase()}`);
      break;
  }
  if (f.required) return base;
  if (f.kind === "text" || f.kind === "textarea") return base.optional();
  if (f.kind === "multi") return base.optional();
  if (f.kind === "bool") return base.optional();
  return base.nullable().optional();
}

const cache = new Map<string, z.ZodType>();

/** Zod schema for a record type's `data`, built from its field definitions. */
export function dataSchema(type: string): z.ZodType<Record<string, unknown>> {
  const def = RECORD_TYPES[type];
  if (!def) throw new Error(`Unknown record type: ${type}`);
  let sch = cache.get(type);
  if (!sch) {
    sch = z.object(Object.fromEntries(def.fields.map((f) => [f.key, fieldSchema(f)])));
    cache.set(type, sch);
  }
  return sch as z.ZodType<Record<string, unknown>>;
}
