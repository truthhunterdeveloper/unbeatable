import { useEffect, useRef, useState } from "react";
import { KeyRound, UserRound, Send, Sparkles, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Card, PageHeader } from "@/components/ui/misc";
import { useApp } from "@/hooks/app";
import { askCoach, buildContext, getAiKey, getProfile, setAiKey, setProfile, type ChatMsg } from "@/lib/ai";
import { errorMessage } from "@/lib/utils";

const STORE = "dos:aiChat";
const IDEAS = [
  "Spiegami la partita doppia con un esempio",
  "Interrogami di diritto sulla Costituzione",
  "Fammi un piano di studio per questa settimana",
  "Correggi il mio tema di italiano",
  "Esercizi di matematica sulle disequazioni",
  "Come preparo una partita da arbitro?",
];

function load(): ChatMsg[] {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "[]");
  } catch {
    return [];
  }
}

export function AiPage() {
  const { today } = useApp();
  const [key, setKey] = useState(getAiKey());
  const [draftKey, setDraftKey] = useState("");
  const [msgs, setMsgs] = useState<ChatMsg[]>(load);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [profile, setProfileState] = useState(getProfile());
  const [showProfile, setShowProfile] = useState(!getProfile());
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(msgs.slice(-60)));
    } catch {
      /* ignore */
    }
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setErr(null);
    setInput("");
    const history: ChatMsg[] = [...msgs, { role: "user", content: q }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setBusy(true);
    abort.current = new AbortController();
    try {
      const ctx = await buildContext(today);
      const final = await askCoach(history, ctx, (t) => setMsgs([...history, { role: "assistant", content: t }]), abort.current.signal);
      setMsgs([...history, { role: "assistant", content: final }]);
    } catch (e) {
      if (!abort.current?.signal.aborted) {
        setErr(errorMessage(e));
        setMsgs(history.slice(0, -1));
        setInput(q);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!key) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <PageHeader title="Coach AI" description="Il tuo tutor per tutte le materie e per il resto: calcio, business, Deen, organizzazione." />
        <Card className="flex flex-col gap-3 p-4 text-[13px] leading-relaxed text-muted">
          <p className="flex items-center gap-2 font-medium text-fg">
            <KeyRound className="size-4" /> Serve una chiave API di Claude
          </p>
          <p>
            Il coach usa Claude di Anthropic. La chiave si crea su <span className="font-mono text-fg">console.anthropic.com</span> (account da maggiorenne: fallo fare a un genitore) e si paga in base all'uso, di solito pochi
            centesimi a domanda. La chiave resta solo su questo dispositivo e non finisce nei file di sync o backup.
          </p>
          <Input type="password" placeholder="sk-ant-…" value={draftKey} onChange={(e) => setDraftKey(e.target.value)} autoComplete="off" />
          <Button
            variant="primary"
            disabled={!draftKey.trim().startsWith("sk-ant-")}
            onClick={() => {
              setAiKey(draftKey);
              setKey(getAiKey());
              setDraftKey("");
            }}
          >
            Salva chiave
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-9rem)] max-w-3xl flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Coach AI" description="Chiedi qualsiasi cosa: spiegazioni, interrogazioni, piani di studio, consigli. Conosce le tue materie e attività." />
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" onClick={() => setShowProfile((v) => !v)}>
            <UserRound /> Su di me
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMsgs([])} aria-label="Nuova chat" disabled={busy}>
            <Trash2 />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAiKey("");
              setKey("");
            }}
          >
            <KeyRound /> Chiave
          </Button>
        </div>
      </div>

      {showProfile ? (
        <Card className="flex flex-col gap-2 p-3">
          <p className="text-xs text-subtle">Scrivi chi sei (età, scuola, sport, obiettivi, fede…). Resta solo su questo dispositivo e aiuta il coach a capirti.</p>
          <Textarea rows={3} value={profile} onChange={(e) => setProfileState(e.target.value)} placeholder="Es. età, scuola e indirizzo, sport, obiettivi…" />
          <Button
            size="sm"
            className="self-end"
            onClick={() => {
              setProfile(profile.trim());
              setShowProfile(false);
            }}
          >
            Salva
          </Button>
        </Card>
      ) : null}
      <Card className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        {msgs.length === 0 ? (
          <div className="m-auto flex max-w-md flex-col items-center gap-3 text-center">
            <Sparkles className="size-5 text-subtle" />
            <p className="text-sm text-muted">Da dove partiamo?</p>
            <div className="flex flex-wrap justify-center gap-2">
              {IDEAS.map((i) => (
                <button key={i} type="button" onClick={() => send(i)} className="rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:border-line-strong hover:text-fg">
                  {i}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-2xl bg-elevated px-3.5 py-2 text-sm text-fg" : "max-w-full text-sm leading-relaxed whitespace-pre-wrap text-fg"}>
                {m.content || (busy && i === msgs.length - 1 ? <span className="text-subtle">Sto pensando…</span> : null)}
              </div>
            ))}
            <div ref={end} />
          </div>
        )}
      </Card>

      {err ? <p className="text-xs text-danger">{err}</p> : null}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Textarea
          rows={2}
          value={input}
          placeholder="Scrivi una domanda…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          className="flex-1 resize-none"
        />
        {busy ? (
          <Button type="button" onClick={() => abort.current?.abort()} aria-label="Ferma">
            <Square />
          </Button>
        ) : (
          <Button type="submit" variant="primary" disabled={!input.trim()} aria-label="Invia">
            <Send />
          </Button>
        )}
      </form>
    </div>
  );
}
