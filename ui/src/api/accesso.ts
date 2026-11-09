import type { QueryClient } from "@tanstack/react-query";
import { ErroreRichiesta } from "./client";
import type { CorpoErrore } from "./tipi";

// La password per entrare: serve? sono dentro? Il servizio tiene la sessione in un cookie (HttpOnly), qui non si vede mai.
export interface StatoAccesso {
  protetta: boolean;
  autenticato: boolean;
}

// Scatta quando un'API risponde 401: la sessione e' finita (o la password e' cambiata) e si torna alla schermata della password.
export const EVENTO_ACCESSO_RICHIESTO = "accesso-richiesto";

async function chiama<T>(metodo: string, percorso: string, corpo?: unknown): Promise<T> {
  const r = await fetch(`/api/accesso${percorso}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (!r.ok) {
    let dettaglio: CorpoErrore | undefined;
    try {
      dettaglio = (await r.json()) as CorpoErrore;
    } catch {
      // senza corpo JSON
    }
    throw new ErroreRichiesta(`/accesso${percorso}`, r.status, dettaglio);
  }
  return r.status === 204 ? (undefined as T) : ((await r.json()) as T);
}

export const CHIAVE_ACCESSO = ["accesso"] as const;

// Cambia lo stato dell'accesso e butta via tutti gli altri dati ricordati (di chi c'era prima). Non si usa client.clear():
// staccherebbe la query dell'accesso da chi la guarda e la schermata non si aggiornerebbe.
export function impostaAccesso(client: QueryClient, stato: { protetta: boolean; autenticato: boolean }): void {
  client.removeQueries({ predicate: (q) => q.queryKey[0] !== CHIAVE_ACCESSO[0] });
  client.setQueryData(CHIAVE_ACCESSO, stato);
}

export const accesso = {
  stato: () => chiama<StatoAccesso>("GET", ""),
  entra: (password: string) => chiama<StatoAccesso>("POST", "", { password }),
  esci: () => chiama<void>("DELETE", ""),
  // `nuova` vuota toglie la password. `attuale` serve solo se una password c'e' gia'.
  cambiaPassword: (attuale: string, nuova: string) => chiama<StatoAccesso>("PUT", "/password", { attuale, nuova }),
};

// Ogni 401 delle API (tranne quelle dell'accesso stesso, che lo gestiscono da sole) avvisa l'interfaccia.
export function osservaAccesso(): void {
  const fetchPrima = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const r = await fetchPrima(input, init);
    if (r.status === 401) {
      const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, window.location.href);
      if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/accesso")) {
        window.dispatchEvent(new Event(EVENTO_ACCESSO_RICHIESTO));
      }
    }
    return r;
  };
}
