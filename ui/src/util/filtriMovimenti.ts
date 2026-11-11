import type { RaggruppaVoci } from "../api/tipi";

// I filtri «per voce» dei Movimenti, letti dall'indirizzo: ci si arriva dal dettaglio di una voce delle statistiche
// («Vedi in Movimenti») o dalla pillola «Da pagare». Un valore che non si capisce si ignora.

export interface FiltriVoce {
  // tipo=COSTI: costi variabili + costi fissi (da «Vedi in Movimenti» di una categoria con «Costi»). Non e' una scelta del selettore
  // di tipo e non si ricorda nel browser (filtriSalvati): vive solo nell'indirizzo e si toglie dal suo chip.
  tipo?: "COSTI";
  fornitore?: number;
  dipendente?: number;
  senza?: RaggruppaVoci;
  retribuzione?: true;
  // false = solo le fatture da pagare, true = solo quelle pagate.
  pagata?: boolean;
}

export type ParametroVoce = "tipo" | "fornitore" | "dipendente" | "senza" | "retribuzione" | "pagata";

const SENZA: Record<RaggruppaVoci, string> = { FORNITORE: "Senza fornitore", DIPENDENTE: "Senza dipendente", CATEGORIA: "Senza categoria" };

function idDa(grezzo: string | null): number | undefined {
  if (!grezzo || !/^\d+$/.test(grezzo)) return undefined;
  const n = Number(grezzo);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

export function leggiFiltriVoce(parametri: URLSearchParams): FiltriVoce {
  const filtri: FiltriVoce = {};
  if (parametri.get("tipo") === "COSTI") filtri.tipo = "COSTI";
  const fornitore = idDa(parametri.get("fornitore"));
  if (fornitore !== undefined) filtri.fornitore = fornitore;
  const dipendente = idDa(parametri.get("dipendente"));
  if (dipendente !== undefined) filtri.dipendente = dipendente;
  const senza = parametri.get("senza");
  if (senza === "FORNITORE" || senza === "DIPENDENTE" || senza === "CATEGORIA") filtri.senza = senza;
  if (parametri.get("retribuzione") === "true") filtri.retribuzione = true;
  const pagata = parametri.get("pagata");
  if (pagata === "true" || pagata === "false") filtri.pagata = pagata === "true";
  return filtri;
}

export interface ChipFiltro {
  // Il parametro dell'indirizzo che il chip toglie.
  parametro: ParametroVoce;
  testo: string;
}

// I chip da mostrare sopra l'elenco. «Da pagare» (pagata=false) non e' fra questi: ha la sua pillola.
// `nomi`: i nomi del fornitore e del dipendente scelti, se si conoscono.
export function chipDeiFiltri(filtri: FiltriVoce, nomi: { fornitore?: string | undefined; dipendente?: string | undefined } = {}): ChipFiltro[] {
  const chip: ChipFiltro[] = [];
  if (filtri.tipo === "COSTI") chip.push({ parametro: "tipo", testo: "Solo costi" });
  if (filtri.fornitore !== undefined) chip.push({ parametro: "fornitore", testo: nomi.fornitore ? `Fornitore: ${nomi.fornitore}` : "Un solo fornitore" });
  if (filtri.dipendente !== undefined) chip.push({ parametro: "dipendente", testo: nomi.dipendente ? `Dipendente: ${nomi.dipendente}` : "Un solo dipendente" });
  if (filtri.senza) chip.push({ parametro: "senza", testo: SENZA[filtri.senza] });
  if (filtri.retribuzione) chip.push({ parametro: "retribuzione", testo: "Solo retribuzioni" });
  if (filtri.pagata === true) chip.push({ parametro: "pagata", testo: "Solo fatture pagate" });
  return chip;
}
