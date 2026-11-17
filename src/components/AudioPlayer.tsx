import { useEffect, useRef, useState } from "react";
import Dexie from "dexie";
import { Music, Pause, Play, Square } from "lucide-react";

/** The intro audio is stored on the device in its own database (not exported or synced). */
const mediaDb = new Dexie("unbeatable-media");
mediaDb.version(1).stores({ files: "key" });
const files = mediaDb.table<{ key: string; blob: Blob; name: string }, string>("files");

export async function saveIntroAudio(file: File) {
  await files.put({ key: "intro", blob: file, name: file.name });
  window.dispatchEvent(new Event("intro-audio-changed"));
}
export async function removeIntroAudio() {
  await files.delete("intro");
  window.dispatchEvent(new Event("intro-audio-changed"));
}
export async function introAudioName(): Promise<string | null> {
  return (await files.get("intro"))?.name ?? null;
}

/** Bundled fallback: put a file at public/audio/intro.mp3 to ship it inside the app. */
const BUNDLED = `${import.meta.env.BASE_URL}audio/intro.mp3`;

async function resolveSrc(): Promise<string | null> {
  const f = await files.get("intro").catch(() => undefined);
  if (f) return URL.createObjectURL(f.blob);
  try {
    const r = await fetch(BUNDLED, { method: "HEAD" });
    if (r.ok && (r.headers.get("content-type") ?? "").startsWith("audio")) return BUNDLED;
  } catch {
    /* none */
  }
  return null;
}

/**
 * Plays the intro audio automatically when the app opens and loops it; a small pill lets you
 * pause, resume or stop it. If the browser blocks autoplay, it starts on the first tap.
 */
export function AudioPlayer() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      resolveSrc().then((s) => {
        if (!alive) return;
        setHidden(false);
        setSrc(s);
      });
    load();
    window.addEventListener("intro-audio-changed", load);
    return () => {
      alive = false;
      window.removeEventListener("intro-audio-changed", load);
    };
  }, []);

  useEffect(() => {
    if (!src) return;
    const a = new Audio(src);
    audio.current = a;
    a.onplay = () => setPlaying(true);
    a.onpause = () => setPlaying(false);
    a.loop = true; // keeps playing until you stop it
    const onFirstTap = () => {
      a.play().catch(() => {});
      window.removeEventListener("pointerdown", onFirstTap);
    };
    a.play().catch(() => window.addEventListener("pointerdown", onFirstTap, { once: true }));
    return () => {
      a.pause();
      window.removeEventListener("pointerdown", onFirstTap);
      if (src.startsWith("blob:")) URL.revokeObjectURL(src);
    };
  }, [src]);

  if (!src || hidden) return null;
  const a = audio.current;
  return (
    <div className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-1 rounded-full border border-line-strong bg-elevated/95 py-1 pr-1 pl-3 text-xs text-muted shadow-lg min-[560px]:bottom-6">
      <Music className="size-3.5" />
      <span className="mr-1">{playing ? "In riproduzione" : "In pausa"}</span>
      <button type="button" aria-label={playing ? "Pausa" : "Riproduci"} onClick={() => (playing ? a?.pause() : a?.play())} className="grid size-7 place-items-center rounded-full hover:bg-white/10 hover:text-fg">
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </button>
      <button
        type="button"
        aria-label="Stop"
        onClick={() => {
          if (a) {
            a.pause();
            a.currentTime = 0;
          }
          setHidden(true);
        }}
        className="grid size-7 place-items-center rounded-full hover:bg-white/10 hover:text-fg"
      >
        <Square className="size-3.5" />
      </button>
    </div>
  );
}
