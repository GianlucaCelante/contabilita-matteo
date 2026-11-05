import type { QueryClient } from "@tanstack/react-query";
import type {
  Ambito,
  Anagrafica,
  Categoria,
  CopiaBackup,
  CorpoErrore,
  Dipendente,
  ElencoMovimenti,
  FiltroMovimenti,
  CasellaFattura,
  CasellaInput,
  Fatture,
  Fornitore,
  MeseFattura,
  MeseFatturaInput,
  Movimento,
  MovimentoInput,
  Programma,
  PromemoriaFatture,
  RaggruppaVoci,
  Rete,
  Riepilogo,
  RispostaRipristino,
  Sede,
  Settimana,
  SettimanaInput,
  Statistiche,
  StatisticheVoci,
  Tipo,
  TipoVoci,
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

export function stringaQuery(parametri: Record<string, string | number | boolean | undefined>): string {
  const p = new URLSearchParams();
  for (const [chiave, valore] of Object.entries(parametri)) {
    if (valore !== undefined && valore !== "") p.set(chiave, String(valore));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

const json = (corpo: unknown): RequestInit => ({ body: JSON.stringify(corpo) });

export const api = {
  riepilogo: (da: string, a: string, sedi?: string) => richiedi<Riepilogo>(`/riepilogo${stringaQuery({ da, a, sedi })}`),
  movimenti: (f: FiltroMovimenti) => richiedi<ElencoMovimenti>(`/movimenti${stringaQuery({ ...f })}`),
  movimento: (id: number) => richiedi<Movimento>(`/movimenti/${id}`),
  creaMovimento: (corpo: MovimentoInput) => richiedi<Movimento>("/movimenti", { method: "POST", ...json(corpo) }),
  modificaMovimento: (id: number, corpo: MovimentoInput, ambito: Ambito) =>
    richiedi<Movimento>(`/movimenti/${id}${stringaQuery({ ambito })}`, { method: "PUT", ...json(corpo) }),
  eliminaMovimento: (id: number, ambito: Ambito) =>
    richiedi<void>(`/movimenti/${id}${stringaQuery({ ambito })}`, { method: "DELETE" }),
  // Per dividere fra tutte le sedi attive (corpo senza sedeId): risponde con un movimento per sede.
  // `sedi`: gli id delle sedi fra cui dividere; vuoto o assente = tutte le sedi attive.
  dividiMovimento: (corpo: MovimentoInput, sedi: number[] = []) =>
    richiedi<Movimento[]>(`/movimenti/dividi${sedi.length > 0 ? `?sedi=${sedi.join(",")}` : ""}`, { method: "POST", ...json(corpo) }),
  sedi: () => richiedi<Sede[]>("/sedi"),
  creaSede: (nome: string) => richiedi<Sede>("/sedi", { method: "POST", ...json({ nome }) }),
  modificaSede: (id: number, corpo: { nome?: string; archiviata?: boolean }) => richiedi<Sede>(`/sedi/${id}`, { method: "PUT", ...json(corpo) }),
  // Pizze e ordini: una settimana (un giorno qualsiasi, assente = oggi) e le statistiche di un periodo.
  settimanaStatistiche: (data?: string) => richiedi<Settimana>(`/statistiche/settimana${stringaQuery({ data })}`),
  salvaSettimanaStatistiche: (corpo: SettimanaInput) => richiedi<Settimana>("/statistiche/settimana", { method: "PUT", ...json(corpo) }),
  statistiche: (da: string, a: string, sedi?: string) => richiedi<Statistiche>(`/statistiche${stringaQuery({ da, a, sedi })}`),
  fermaRicorrenza: (id: number) => richiedi<void>(`/ricorrenze/${id}/ferma`, { method: "POST" }),
  riattivaRicorrenza: (id: number) => richiedi<void>(`/ricorrenze/${id}/riattiva`, { method: "POST" }),
  categorie: (tipo?: Tipo) => richiedi<Categoria[]>(`/categorie${stringaQuery({ tipo })}`),
  // Crea (201) o restituisce quella che c'e' gia' con lo stesso nome e tipo (200; il flag allora non cambia). `retribuzione` solo per COSTO_FISSO.
  creaCategoria: (corpo: { nome: string; tipo: Tipo; retribuzione?: boolean }) => richiedi<Categoria>("/categorie", { method: "POST", ...json(corpo) }),
  // Rinomina e/o cambia il flag retribuzione (almeno uno dei due). 409 se il nome e' gia' usato nello stesso tipo o se si toglie il flag
  // a una categoria che ha gia' delle retribuzioni.
  modificaCategoria: (id: number, corpo: { nome?: string; retribuzione?: boolean }) => richiedi<Categoria>(`/categorie/${id}`, { method: "PUT", ...json(corpo) }),
  // Prima di salvare una retribuzione si assicura che la categoria esista con il flag: un nome nuovo la crea come retribuzione, una che
  // c'e' gia' resta com'e' (200, il flag non cambia). Gli altri movimenti creano la categoria da soli, per nome.
  assicuraCategoriaRetribuzione: async (corpo: Pick<MovimentoInput, "tipo" | "documento" | "categoria">): Promise<void> => {
    if (corpo.tipo !== "COSTO_FISSO" || !corpo.categoria) return;
    if (corpo.documento !== "RETRIBUZIONE_REGOLARE" && corpo.documento !== "RETRIBUZIONE_EXTRA") return;
    await richiedi<Categoria>("/categorie", { method: "POST", ...json({ nome: corpo.categoria, tipo: corpo.tipo, retribuzione: true }) });
  },
  rinominaFornitore: (id: number, nome: string) => richiedi<Fornitore>(`/fornitori/${id}`, { method: "PUT", ...json({ nome }) }),
  rinominaDipendente: (id: number, nome: string) => richiedi<Dipendente>(`/dipendenti/${id}`, { method: "PUT", ...json({ nome }) }),
  // Elimina una voce: senza `sostituisciCon` i movimenti restano senza quella voce; con l'id di un'altra voce passano a lei (unione).
  eliminaVoce: (anagrafica: Anagrafica, id: number, sostituisciCon?: number) =>
    richiedi<void>(`/${anagrafica}/${id}${stringaQuery({ sostituisciCon })}`, { method: "DELETE" }),
  // Costi e ricavi per fornitore, dipendente o categoria, con il totale di ogni mese del periodo.
  statisticheVoci: (da: string, a: string, raggruppa: RaggruppaVoci, tipo?: TipoVoci, sedi?: string) =>
    richiedi<StatisticheVoci>(`/statistiche/voci${stringaQuery({ da, a, raggruppa, tipo, sedi })}`),
  // Fatture da fare: le caselle dell'utente e, per ogni mese, Da fare / Emessa / Pagata.
  caselleFatture: () => richiedi<CasellaFattura[]>("/fatture/caselle"),
  // Crea (201) o restituisce quella che c'e' gia' con lo stesso nome (200).
  // `giornoScadenza`: entro che giorno del mese (1-31); assente = nessuna. `dalMese` assente = il mese corrente.
  creaCasellaFattura: (corpo: { nome: string; giornoScadenza?: number | null }) => richiedi<CasellaFattura>("/fatture/caselle", { method: "POST", ...json(corpo) }),
  // Nome e/o scadenza (`giornoScadenza: null` la toglie).
  modificaCasellaFattura: (id: number, corpo: CasellaInput) => richiedi<CasellaFattura>(`/fatture/caselle/${id}`, { method: "PUT", ...json(corpo) }),
  eliminaCasellaFattura: (id: number) => richiedi<void>(`/fatture/caselle/${id}`, { method: "DELETE" }),
  fatture: (da: string, a: string) => richiedi<Fatture>(`/fatture${stringaQuery({ da, a })}`),
  // Il promemoria della Home: sempre il mese corrente, indipendente dal periodo che si sta guardando.
  promemoriaFatture: () => richiedi<PromemoriaFatture>("/fatture/promemoria"),
  // Fattura ricevuta pagata / da pagare (solo FATTURA, altrimenti 400).
  segnaPagata: (id: number, pagata: boolean) => richiedi<Movimento>(`/movimenti/${id}/pagata`, { method: "PUT", ...json({ pagata }) }),
  salvaMeseFattura: (id: number, mese: string, corpo: MeseFatturaInput) =>
    richiedi<MeseFattura>(`/fatture/caselle/${id}/mesi/${mese}`, { method: "PUT", ...json(corpo) }),
  fornitori: (q: string) => richiedi<Fornitore[]>(`/fornitori${stringaQuery({ q })}`),
  dipendenti: (q: string) => richiedi<Dipendente[]>(`/dipendenti${stringaQuery({ q })}`),
  rete: () => richiedi<Rete>("/rete"),
  programma: () => richiedi<Programma>("/programma"),
  impostaCartellaBackup: (cartella: string | null) => richiedi<Programma>("/programma/backup", { method: "PUT", ...json({ cartella }) }),
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
  riepilogo: (da: string, a: string, sedi?: string) => ["riepilogo", da, a, sedi ?? ""] as const,
  sedi: ["sedi"] as const,
  statistiche: (da: string, a: string, sedi?: string) => ["statistiche", "periodo", da, a, sedi ?? ""] as const,
  settimanaStatistiche: (lunedi: string) => ["statistiche", "settimana", lunedi] as const,
  statisticheVoci: (da: string, a: string, raggruppa: RaggruppaVoci, tipo?: TipoVoci, sedi?: string) =>
    ["statistiche", "voci", da, a, raggruppa, tipo ?? "", sedi ?? ""] as const,
  movimenti: (f: FiltroMovimenti) => ["movimenti", f] as const,
  movimento: (id: number) => ["movimento", id] as const,
  categorie: (tipo?: Tipo) => ["categorie", tipo ?? ""] as const,
  fornitori: (q: string) => ["fornitori", q] as const,
  dipendenti: (q: string) => ["dipendenti", q] as const,
  fatture: (da: string, a: string) => ["fatture", da, a] as const,
  promemoriaFatture: ["fatture", "promemoria"] as const,
  rete: ["rete"] as const,
  programma: ["programma"] as const,
  copie: ["copie"] as const,
};

// Dopo aver rinominato, unito o eliminato una voce cambiano gli elenchi, i movimenti che la usano e tutti i conti per voce.
export function invalidaVoci(client: QueryClient): void {
  for (const k of ["categorie", "fornitori", "dipendenti", "movimenti", "movimento", "riepilogo", "statistiche"]) {
    void client.invalidateQueries({ queryKey: [k] });
  }
}
