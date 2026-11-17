import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

type Props = { children: ReactNode; fullscreen?: boolean };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unbeatable error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const storage = /indexeddb|database|dexie|storage/i.test(`${error.name} ${error.message}`);
    return (
      <div className={this.props.fullscreen ? "grid min-h-dvh place-items-center p-6" : "py-16"}>
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl border border-danger/25 bg-danger/10 text-danger">
            <AlertTriangle className="size-5" />
          </div>
          <h2 className="text-[15px] font-semibold text-fg">{storage ? "Archivio locale non disponibile" : "Qualcosa è andato storto"}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-subtle">
            {storage
              ? "Unbeatable salva i dati nell'IndexedDB del browser. La navigazione privata o i dati dei siti bloccati possono impedirlo. I tuoi dati esistenti non sono stati modificati."
              : "Questa schermata ha avuto un errore imprevisto. I tuoi dati sono al sicuro su questo dispositivo."}
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg border border-line bg-white/[0.02] p-3 text-left font-mono text-[11px] text-faint">{error.message}</pre>
          <button onClick={() => location.reload()} className="mt-5 h-8 rounded-lg bg-fg px-4 text-[13px] font-medium text-bg hover:bg-white">
            Ricarica
          </button>
        </div>
      </div>
    );
  }
}
