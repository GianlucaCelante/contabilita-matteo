import type { FiltroMovimenti, Movimento, RaggruppaVoci, TipoVoci } from "../api/tipi";
import { dataValida } from "./formato";
import { RAGGRUPPAMENTI, tipoPerServizio } from "./statisticheVoci";

// Il dettaglio di una voce delle statistiche per voce: l'elenco dei movimenti che la compongono (docs/interfaccia.md,
// «Costi e ricavi per voce»). Tutto vive nell'indirizzo, cosi' funziona il tasto indietro e si puo' ricaricare.

export type SceltaTipo = TipoVoci | "TUTTI";

export interface DettaglioVoce {
  raggruppa: RaggruppaVoci;
  // null = la riga «Senza fornitore / dipendente / categoria».
  id: number | null;
  // Solo per le categorie conta (Costi / Ricavi / Tutti): per fornitori e dipendenti il tipo e' scontato.
  tipo: SceltaTipo;
  da: string;
  a: string;
  // «1,2»: le sedi scelte nelle statistiche. Assente = tutte.
  sedi?: string;
}

const TIPI: SceltaTipo[] = ["COSTI", "RICAVO", "TUTTI", "COSTO_VARIABILE", "COSTO_FISSO"];

export function indirizzoDettaglioVoce(d: DettaglioVoce): string {
  const p = new URLSearchParams({ v: d.raggruppa, id: d.id === null ? "senza" : String(d.id), t: d.tipo, da: d.da, a: d.a });
  if (d.sedi) p.set("sedi", d.sedi);
  return `/statistiche/voci/dettaglio?${p.toString()}`;
}

// Il dettaglio descritto da un indirizzo; null se manca qualcosa o non e' valido.
export function leggiDettaglioVoce(p: URLSearchParams): DettaglioVoce | null {
  const raggruppa = RAGGRUPPAMENTI.find((r) => r.valore === p.get("v"))?.valore;
  const grezzoId = p.get("id");
  const id = grezzoId === "senza" ? null : grezzoId !== null && /^\d+$/.test(grezzoId) ? Number(grezzoId) : undefined;
  const da = p.get("da");
  const a = p.get("a");
  if (!raggruppa || id === undefined || !da || !a || !dataValida(da) || !dataValida(a) || da > a) return null;
  const sedi = p.get("sedi");
  return {
    raggruppa,
    id,
    tipo: TIPI.find((t) => t === p.get("t")) ?? "COSTI",
    da,
    a,
    ...(sedi ? { sedi } : {}),
  };
}

// Dove riporta la freccia indietro se non si arriva dalla lista (indirizzo ricaricato o incollato).
export function indirizzoElencoVoci(d: DettaglioVoce): string {
  const p = new URLSearchParams({ v: d.raggruppa, t: d.tipo, p: "periodo", da: d.da, a: d.a });
  return `/statistiche/voci?${p.toString()}`;
}

// I filtri di GET /api/movimenti che danno proprio i movimenti contati dalla riga. Il tipo e' lo stesso delle statistiche
// (fornitori: costi variabili; dipendenti: solo retribuzioni, senza tipo); «Costi» delle categorie e' tipo=COSTI (variabili + fissi): il
// servizio toglie gia' i ricavi, anche dai totali. `soloCosti` resta come garanzia per l'elenco (elementiDellaVoce).
export function filtroDellaVoce(d: DettaglioVoce): { filtro: FiltroMovimenti; soloCosti: boolean } {
  const tipo = tipoPerServizio(d.raggruppa, d.tipo);
  const filtro: FiltroMovimenti = { da: d.da, a: d.a };
  if (tipo) filtro.tipo = tipo;
  // Dipendenti: contano solo le retribuzioni (anche per «Senza dipendente»), senza tipo.
  if (d.raggruppa === "DIPENDENTE") filtro.retribuzione = true;
  if (d.sedi) filtro.sedi = d.sedi;
  if (d.id === null) filtro.senza = d.raggruppa;
  else if (d.raggruppa === "FORNITORE") filtro.fornitore = d.id;
  else if (d.raggruppa === "DIPENDENTE") filtro.dipendente = d.id;
  else filtro.categorie = String(d.id);
  return { filtro, soloCosti: tipo === "COSTI" };
}

// «Vedi in Movimenti»: l'elenco Movimenti con lo stesso periodo e la voce come filtro. Movimenti legge dall'indirizzo il periodo
// (`p=periodo&da=&a=`), il `tipo` (COSTI per «Costi» delle categorie; vuoto se la voce non ne ha uno: «Tutti», i dipendenti) e UNO fra
// `fornitore`, `dipendente`, `categorie`, `senza`; per i dipendenti (anche «Senza dipendente») `retribuzione=true`, perche' la riga
// conta solo le paghe.
export function indirizzoMovimentiDellaVoce(d: DettaglioVoce): string {
  const { filtro } = filtroDellaVoce(d);
  const p = new URLSearchParams({ p: "periodo", da: d.da, a: d.a });
  // Il tipo c'e' sempre, anche vuoto (`tipo=` = «Tutti»): senza, Movimenti userebbe l'ultimo tipo ricordato e scarterebbe la categoria.
  p.set("tipo", filtro.tipo ?? "");
  if (filtro.senza) p.set("senza", filtro.senza);
  else if (filtro.fornitore !== undefined) p.set("fornitore", String(filtro.fornitore));
  else if (filtro.dipendente !== undefined) p.set("dipendente", String(filtro.dipendente));
  else if (filtro.categorie) p.set("categorie", filtro.categorie);
  if (filtro.retribuzione) p.set("retribuzione", "true");
  return `/movimenti?${p.toString()}`;
}

export function elementiDellaVoce(elementi: Movimento[], soloCosti: boolean): Movimento[] {
  return soloCosti ? elementi.filter((m) => m.tipo !== "RICAVO") : elementi;
}

// Come le statistiche: la nota di credito conta in negativo, il resto in positivo.
export function sommaConSegno(elementi: Movimento[]): number {
  return elementi.reduce((t, m) => t + (m.documento === "NOTA_DI_CREDITO" ? -m.importoCent : m.importoCent), 0);
}
