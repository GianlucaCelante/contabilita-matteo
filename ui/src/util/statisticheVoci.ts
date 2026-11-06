import type { Anagrafica, RaggruppaVoci, StatisticheVoci, TipoVoci, VoceStatistica } from "../api/tipi";

// Logica pura della vista «Costi e ricavi per voce» (docs/api.md, «Statistiche per voce»).

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export const RAGGRUPPAMENTI: { valore: RaggruppaVoci; etichetta: string }[] = [
  { valore: "FORNITORE", etichetta: "Fornitori" },
  { valore: "DIPENDENTE", etichetta: "Dipendenti" },
  { valore: "CATEGORIA", etichetta: "Categorie" },
];

// L'anagrafica (elenco di voci) che corrisponde a ogni raggruppamento.
export const ANAGRAFICA_DI: Record<RaggruppaVoci, Anagrafica> = { FORNITORE: "fornitori", DIPENDENTE: "dipendenti", CATEGORIA: "categorie" };

// Per i fornitori il tipo e' scontato (costi variabili); per i dipendenti non c'e' tipo (contano solo le retribuzioni); la
// scelta compare solo per le categorie.
export const TIPO_PREDEFINITO: Record<RaggruppaVoci, TipoVoci | undefined> = {
  FORNITORE: "COSTO_VARIABILE",
  DIPENDENTE: undefined,
  CATEGORIA: "COSTI",
};

export const OPZIONI_TIPO_CATEGORIA: { valore: TipoVoci | "TUTTI"; etichetta: string }[] = [
  { valore: "COSTI", etichetta: "Costi" },
  { valore: "RICAVO", etichetta: "Ricavi" },
  { valore: "TUTTI", etichetta: "Tutti" },
];

// «Costi fissi» non e' una chip fissa: compare solo se e' il tipo scelto (si arriva dal blocco del Riepilogo); intanto «Costi» resta spenta.
export function opzioniTipoCategoria(scelto: TipoVoci | "TUTTI"): { valore: TipoVoci | "TUTTI"; etichetta: string }[] {
  if (scelto !== "COSTO_FISSO") return OPZIONI_TIPO_CATEGORIA;
  const [costi, ...altre] = OPZIONI_TIPO_CATEGORIA;
  return [costi!, { valore: "COSTO_FISSO", etichetta: "Costi fissi" }, ...altre];
}

// Il tipo delle categorie dall'indirizzo: le chip e, in piu', COSTO_FISSO; altrimenti «Costi».
export function tipoCategoriaDa(grezzo: string | null): TipoVoci | "TUTTI" {
  if (grezzo === "COSTO_FISSO") return "COSTO_FISSO";
  return OPZIONI_TIPO_CATEGORIA.find((o) => o.valore === grezzo)?.valore ?? "COSTI";
}

export type BloccoRiepilogo = "ricavi" | "variabili" | "fissi";

// Dal blocco del Riepilogo alla lista «per voce» dello stesso periodo (tipo + riferimento, oppure da/a per il periodo libero).
export function indirizzoStatisticheDelBlocco(blocco: BloccoRiepilogo, periodo: { tipo: string; da: string; a: string }): string {
  const p = new URLSearchParams({ v: blocco === "variabili" ? "FORNITORE" : "CATEGORIA" });
  if (blocco === "ricavi") p.set("t", "RICAVO");
  if (blocco === "fissi") p.set("t", "COSTO_FISSO");
  p.set("p", periodo.tipo);
  if (periodo.tipo === "periodo") {
    p.set("da", periodo.da);
    p.set("a", periodo.a);
  } else p.set("r", periodo.da);
  return `/statistiche/voci?${p.toString()}`;
}

// Il tipo da mandare al servizio: per le categorie «Tutti» e' l'assenza del parametro; per i dipendenti non si manda
// (il servizio considera solo le retribuzioni e ignora il tipo).
export function tipoPerServizio(raggruppa: RaggruppaVoci, scelta: TipoVoci | "TUTTI"): TipoVoci | undefined {
  if (raggruppa !== "CATEGORIA") return TIPO_PREDEFINITO[raggruppa];
  return scelta === "TUTTI" ? undefined : scelta;
}

// «2026-10» -> «ottobre»; con l'anno «ottobre 2026».
export function nomeMeseDi(mese: string, conAnno = false): string {
  const [a, m] = mese.split("-");
  const nome = MESI[Number(m) - 1] ?? mese;
  return conAnno ? `${nome} ${a}` : nome;
}

// «2026-10» -> «ott»; con l'anno «ott 26» (quando il periodo attraversa piu' anni).
export function meseBreve(mese: string, conAnno = false): string {
  const [a, m] = mese.split("-");
  const nome = (MESI[Number(m) - 1] ?? mese).slice(0, 3);
  return conAnno ? `${nome} ${(a ?? "").slice(2)}` : nome;
}

// Vero se i mesi del periodo toccano piu' di un anno.
export function piuAnni(mesi: string[]): boolean {
  return new Set(mesi.map((m) => m.slice(0, 4))).size > 1;
}

// La larghezza (0-100) della barretta: il valore rispetto al massimo, mai fuori scala, e un filo visibile se c'e' un importo.
export function larghezzaBarra(valore: number, massimo: number): number {
  if (valore <= 0 || massimo <= 0) return 0;
  return Math.min(100, Math.max(2, (valore / massimo) * 100));
}

export interface VoceDelMese {
  voce: VoceStatistica;
  cent: number;
}

// Le voci che hanno un importo nel mese scelto (posizione in `mesi`), dalla piu' alta; a parita' per nome. La riga senza voce in fondo.
export function vociDelMese(dati: StatisticheVoci, indice: number): { righe: VoceDelMese[]; totaleCent: number } {
  const righe = dati.voci
    .map((voce) => ({ voce, cent: voce.perMese[indice] ?? 0 }))
    .filter((r) => r.cent !== 0)
    .sort((x, y) => Number(x.voce.id === null) - Number(y.voce.id === null) || y.cent - x.cent || x.voce.nome.localeCompare(y.voce.nome, "it"));
  return { righe, totaleCent: righe.reduce((t, r) => t + r.cent, 0) };
}

// Il totale di ogni mese (somma delle voci), per la riga dei totali della griglia.
export function totaliPerMese(dati: StatisticheVoci): number[] {
  return dati.mesi.map((_, i) => dati.voci.reduce((t, v) => t + (v.perMese[i] ?? 0), 0));
}

// L'importo piu' alto fra i mesi di una voce: la scala delle barrette dei suoi mesi.
export function massimoMese(voce: VoceStatistica): number {
  return Math.max(0, ...voce.perMese);
}

// Il mese da mostrare per primo quando i mesi sono piu' larghi dello schermo (griglia sul computer, chip sul telefono): il mese
// corrente se e' nel periodo, altrimenti l'ultimo con dati, altrimenti l'ultimo. -1 se non ci sono mesi.
export function meseInEvidenza(mesi: string[], totali: number[], oggi: string): number {
  if (mesi.length === 0) return -1;
  const corrente = mesi.indexOf(oggi.slice(0, 7));
  if (corrente >= 0) return corrente;
  for (let i = mesi.length - 1; i >= 0; i--) if ((totali[i] ?? 0) !== 0) return i;
  return mesi.length - 1;
}
