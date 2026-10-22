import type {
  Ambito,
  Categoria,
  CopiaBackup,
  CorpoErrore,
  Dipendente,
  ElencoMovimenti,
  FiltroMovimenti,
  Fornitore,
  Movimento,
  MovimentoInput,
  Programma,
  Rete,
  Riepilogo,
  RispostaRipristino,
  Tipo,
} from "./tipi";

const BASE = "/api";

export class ErroreRichiesta extends Error {
  constructor(
    public percorso: string,
    public stato: number,
    // Il corpo JSON dell'errore, quando il servizio l'ha mandato: {"errore":"..."}.
    public corpo?: CorpoErrore,
  ) {
    super(corpo?.errore ?? `Richiesta a ${percorso} fallita: ${stato}`);
    this.name = "ErroreRichiesta";
  }
}

// Il testo da mostrare a chi usa l'app per qualunque errore.
export function messaggioErrore(e: unknown): string {
  if (e instanceof ErroreRichiesta) {
    if (e.corpo?.errore) return e.corpo.errore;
    if (e.stato === 404) return "Non trovato.";
    return "Il servizio ha risposto con un errore. Riprova fra poco.";
  }
  if (e instanceof TypeError) return "Non riesco a parlare con il servizio. Controlla che sia acceso.";
  return e instanceof Error ? e.message : "Qualcosa è andato storto.";
}

async function richiedi<T>(percorso: string, opzioni?: RequestInit): Promise<T> {
  const risposta = await fetch(`${BASE}${percorso}`, {
    ...opzioni,
    headers: { "Content-Type": "application/json", ...(opzioni?.headers ?? {}) },
  });
  if (!risposta.ok) {
    let corpo: CorpoErrore | undefined;
    try {
      corpo = (await risposta.json()) as CorpoErrore;
    } catch {
      // corpo assente o non JSON: si resta senza dettaglio
    }
    throw new ErroreRichiesta(percorso, risposta.status, corpo);
  }
  if (risposta.status === 204) return undefined as T;
  return (await risposta.json()) as T;
}

function stringaQuery(parametri: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [chiave, valore] of Object.entries(parametri)) {
    if (valore !== undefined && valore !== "") p.set(chiave, String(valore));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

const json = (corpo: unknown): RequestInit => ({ body: JSON.stringify(corpo) });

export const api = {
  riepilogo: (da: string, a: string) => richiedi<Riepilogo>(`/riepilogo${stringaQuery({ da, a })}`),
  movimenti: (f: FiltroMovimenti) => richiedi<ElencoMovimenti>(`/movimenti${stringaQuery({ ...f })}`),
  movimento: (id: number) => richiedi<Movimento>(`/movimenti/${id}`),
  creaMovimento: (corpo: MovimentoInput) => richiedi<Movimento>("/movimenti", { method: "POST", ...json(corpo) }),
  modificaMovimento: (id: number, corpo: MovimentoInput, ambito: Ambito) =>
    richiedi<Movimento>(`/movimenti/${id}${stringaQuery({ ambito })}`, { method: "PUT", ...json(corpo) }),
  eliminaMovimento: (id: number, ambito: Ambito) =>
    richiedi<void>(`/movimenti/${id}${stringaQuery({ ambito })}`, { method: "DELETE" }),
  fermaRicorrenza: (id: number) => richiedi<void>(`/ricorrenze/${id}/ferma`, { method: "POST" }),
  categorie: (tipo?: Tipo) => richiedi<Categoria[]>(`/categorie${stringaQuery({ tipo })}`),
  fornitori: (q: string) => richiedi<Fornitore[]>(`/fornitori${stringaQuery({ q })}`),
  dipendenti: (q: string) => richiedi<Dipendente[]>(`/dipendenti${stringaQuery({ q })}`),
  rete: () => richiedi<Rete>("/rete"),
  programma: () => richiedi<Programma>("/programma"),
  backupOra: () => richiedi<{ cartella: string }>("/programma/backup", { method: "POST" }),
  copie: () => richiedi<CopiaBackup[]>("/programma/copie"),
  ripristina: (copia: string) => richiedi<RispostaRipristino>("/programma/ripristina", { method: "POST", ...json({ copia }) }),
  // Risponde finche' il servizio e' acceso: serve a capire quando e' tornato dopo un riavvio.
  servizioRisponde: async (): Promise<boolean> => {
    try {
      const r = await fetch(`${BASE}/versione`, { cache: "no-store" });
      return r.ok;
    } catch {
      return false;
    }
  },
};

export function urlQr(ip: string): string {
  return `${BASE}/rete/qr.png${stringaQuery({ ip })}`;
}

// Le chiavi della cache di react-query, tutte qui: chi modifica i dati
// invalida per prefisso (["movimenti"], ["riepilogo"]).
export const chiavi = {
  riepilogo: (da: string, a: string) => ["riepilogo", da, a] as const,
  movimenti: (f: FiltroMovimenti) => ["movimenti", f] as const,
  movimento: (id: number) => ["movimento", id] as const,
  categorie: (tipo?: Tipo) => ["categorie", tipo ?? ""] as const,
  fornitori: (q: string) => ["fornitori", q] as const,
  dipendenti: (q: string) => ["dipendenti", q] as const,
  rete: ["rete"] as const,
  programma: ["programma"] as const,
  copie: ["copie"] as const,
};
