import type { Anagrafica, Tipo } from "../api/tipi";
import { MASSIMO_NOME_CATEGORIA, normalizzaNome } from "./categorie";

// Categorie, fornitori e dipendenti hanno lo stesso comportamento (rinomina, unisci, elimina): qui i testi che cambiano.
// docs/api.md, «Gestione di categorie, fornitori e dipendenti».

export interface DescrizioneAnagrafica {
  // «categoria», «fornitore», «dipendente»
  nome: string;
  genere: "m" | "f";
  // «Senza categoria»: la riga dei movimenti rimasti senza la voce
  senza: string;
  // Messaggi del servizio finto: «Categoria non trovata.», «Il fornitore con cui unire non esiste.», «due categorie diverse»
  nonTrovata: string;
  altraNonTrovata: string;
  dueDiverse: string;
  // «della categoria» / «del fornitore»
  del: string;
  // «una categoria» / «un fornitore»
  uno: string;
}

export const ANAGRAFICA: Record<Anagrafica, DescrizioneAnagrafica> = {
  categorie: { nome: "categoria", genere: "f", senza: "Senza categoria", nonTrovata: "Categoria non trovata.", altraNonTrovata: "La categoria con cui unire non esiste.", dueDiverse: "due categorie diverse", del: "della categoria", uno: "una categoria" },
  fornitori: { nome: "fornitore", genere: "m", senza: "Senza fornitore", nonTrovata: "Fornitore non trovato.", altraNonTrovata: "Il fornitore con cui unire non esiste.", dueDiverse: "due fornitori diversi", del: "del fornitore", uno: "un fornitore" },
  dipendenti: { nome: "dipendente", genere: "m", senza: "Senza dipendente", nonTrovata: "Dipendente non trovato.", altraNonTrovata: "Il dipendente con cui unire non esiste.", dueDiverse: "due dipendenti diversi", del: "del dipendente", uno: "un dipendente" },
};

// «usata da 3 movimenti» / «usato da 1 movimento» / «mai usata»
export function testoUsi(anagrafica: Anagrafica, usi: number): string {
  const f = ANAGRAFICA[anagrafica].genere === "f";
  if (usi <= 0) return f ? "mai usata" : "mai usato";
  return `${f ? "usata" : "usato"} da ${usi} ${usi === 1 ? "movimento" : "movimenti"}`;
}

// Per le righe degli elenchi: «3 movimenti», «Nessun movimento».
export function testoMovimenti(n: number): string {
  if (n <= 0) return "Nessun movimento";
  return `${n} ${n === 1 ? "movimento" : "movimenti"}`;
}

// La frase della conferma di eliminazione: «usata da 9 movimenti in tutto: resteranno senza categoria». Una voce mai usata si elimina e basta.
export function avvisoEliminazione(anagrafica: Anagrafica, nome: string, usi: number): string {
  const d = ANAGRAFICA[anagrafica];
  if (usi <= 0) return `«${nome}» non è ${d.genere === "f" ? "usata" : "usato"} da nessun movimento: si elimina e basta.`;
  return `«${nome}» è ${testoUsi(anagrafica, usi)} in tutto: ${usi === 1 ? "resterà" : "resteranno"} senza ${d.nome}.`;
}

// Il messaggio per un nome non valido, null se va bene (il nome si conta dopo la normalizzazione).
export function erroreNomeVoce(anagrafica: Anagrafica, nome: string): string | null {
  const n = normalizzaNome(nome);
  if (!n) return `Scrivi il nome ${ANAGRAFICA[anagrafica].del}.`;
  if (n.length > MASSIMO_NOME_CATEGORIA) return `Il nome può avere al massimo ${MASSIMO_NOME_CATEGORIA} caratteri.`;
  return null;
}

// Una voce da proporre come destinazione dell'unione: stessa anagrafica, non se stessa e, per le categorie, dello stesso tipo.
export function destinazioniUnione<T extends { id: number; tipo?: string }>(lista: T[], origine: { id: number; tipo?: string }): T[] {
  return lista.filter((x) => x.id !== origine.id && (origine.tipo === undefined || x.tipo === origine.tipo));
}

// Il tipo di una categoria a parole, per dire che si unisce solo fra categorie dello stesso tipo.
export function nomeTipoCategoria(tipo: Tipo): string {
  return tipo === "COSTO_FISSO" ? "costi fissi" : tipo === "COSTO_VARIABILE" ? "costi variabili" : "ricavi";
}

// Il passo di conferma prima di unire: non si puo' annullare dopo, quindi la conferma e' la protezione.
export function testoConfermaUnione(da: string, a: string, usi: number): string {
  const spostati = usi <= 0 ? "" : usi === 1 ? ` 1 movimento passerà a «${a}» e` : ` ${usi} movimenti passeranno a «${a}» e`;
  return `Unire «${da}» in «${a}»?${spostati} «${da}» sparirà. Non si può annullare.`;
}

// La ricerca della destinazione non trova nulla: dice perche' (stesso tipo / stessa anagrafica) e cosa fare.
export function testoNessunaDestinazione(anagrafica: Anagrafica, tipo?: Tipo): string {
  const d = ANAGRAFICA[anagrafica];
  if (tipo) return `Nessuna voce con questo nome tra i ${nomeTipoCategoria(tipo)}. Per unire serve una voce già esistente dello stesso tipo.`;
  return `Nessun${d.genere === "f" ? "a" : ""} ${d.nome} con questo nome. Per unire serve ${d.uno} già esistente.`;
}

// L'interruttore «È una retribuzione» di una categoria: acceso e gia' usata, il servizio rifiuta di spegnerlo (409), quindi lo si blocca spiegando.
export function interruttoreRetribuzione(c: { retribuzione?: boolean | undefined; usi: number }): { bloccato: boolean; motivo?: string } {
  if (c.retribuzione && c.usi > 0) return { bloccato: true, motivo: `Non si può togliere: questa categoria ha già ${testoMovimenti(c.usi).toLowerCase()}.` };
  return { bloccato: false };
}

// Sotto il titolo di «Rinomina»: il nuovo nome vale anche per i movimenti che usano la voce (singolare con 1). Undefined se nessuno.
export function frasePerRinomina(usi: number, genere: "f" | "m"): string | undefined {
  if (usi <= 0) return undefined;
  const lei = genere === "f";
  return usi === 1 ? `Il nuovo nome vale anche per il movimento che ${lei ? "la" : "lo"} usa.` : `Il nuovo nome vale anche per i ${usi} movimenti che ${lei ? "la" : "lo"} usano.`;
}
