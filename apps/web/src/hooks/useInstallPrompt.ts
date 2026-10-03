import { useCallback, useEffect, useState } from "react";

/** Evento non standard (Chromium/Edge/Android): permette di proporre l'installazione al momento scelto dall'app. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/** Chiave in `sessionStorage`: il banner si propone una sola volta per sessione (poi, o dopo «Non ora», non si ripresenta). */
export const INSTALL_BANNER_SESSION_KEY = "routefuel.install-banner.done";

// L'evento può scattare prima che React abbia montato il banner: `captureInstallPrompt()` (chiamata da main.tsx) lo conserva.
let earlyEvent: BeforeInstallPromptEvent | null = null;
let captureStarted = false;

export function captureInstallPrompt(): void {
  if (captureStarted) return;
  captureStarted = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // niente mini-infobar del browser: la proposta è il nostro banner
    earlyEvent = event as BeforeInstallPromptEvent;
  });
}

/** Solo per i test: dimentica l'evento catturato. */
export function resetInstallPromptCapture(): void {
  earlyEvent = null;
  captureStarted = false;
}

const readDone = (): boolean => {
  try {
    return sessionStorage.getItem(INSTALL_BANNER_SESSION_KEY) === "1";
  } catch {
    return false;
  }
};

const markDone = () => {
  try {
    sessionStorage.setItem(INSTALL_BANNER_SESSION_KEY, "1");
  } catch {
    // sessionStorage bloccato: il banner si nasconde comunque per questa visita (stato React)
  }
};

/** Già installata e aperta come app (finestra standalone, o iOS «Aggiungi a Home»). */
export const isStandalone = (): boolean =>
  (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export interface InstallPrompt {
  /** Il browser ha offerto l'installazione e il banner non è ancora stato mostrato/chiuso in questa sessione. */
  canInstall: boolean;
  /** Apre la finestra di installazione del browser. Restituisce l'esito, o null se non c'era nulla da installare. */
  install: () => Promise<"accepted" | "dismissed" | null>;
  /** «Non ora»: nasconde il banner per il resto della sessione. */
  dismiss: () => void;
}

/**
 * Cattura `beforeinstallprompt` e lo tiene da parte per proporlo con un banner discreto, una volta per sessione.
 * Non propone nulla se l'app è già installata o aperta in modalità standalone, né sui browser senza l'evento (Safari).
 */
export function useInstallPrompt(): InstallPrompt {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(earlyEvent);
  const [done, setDone] = useState(readDone);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      earlyEvent = event as BeforeInstallPromptEvent;
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      earlyEvent = null;
      setDeferred(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const finish = useCallback(() => {
    markDone();
    setDone(true);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return null;
    // L'evento si può usare una sola volta, qualunque sia l'esito.
    earlyEvent = null;
    setDeferred(null);
    finish();
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    return outcome;
  }, [deferred, finish]);

  return { canInstall: deferred !== null && !done && !installed, install, dismiss: finish };
}
