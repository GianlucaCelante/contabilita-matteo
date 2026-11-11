import type { Tipo } from "../api/tipi";
import { dataValida, intervalloDi, nomeMese, type Intervallo, type TipoPeriodo } from "./formato";

// I filtri di periodo e di tipo si ricordano nel browser: passando da una pagina all'altra e anche dopo
// aver chiuso l'applicazione si riparte da dove si era. Chi non puo' scrivere nel magazzino del browser
// (modalita' privata, dati bloccati) non perde nulla: i filtri restano quelli dell'indirizzo.

export interface FiltriSalvati {
  p?: TipoPeriodo;
  r?: string;
  da?: string;
  a?: string;
  // «» = Tutti
  tipo?: Tipo | "";
  // Gli id delle categorie scelte nel filtro di Movimenti; [] = nessuna.
  categorie?: number[];
}

interface Magazzino {
  getItem(chiave: string): string | null;
  setItem(chiave: string, valore: string): void;
}

const CHIAVE = "contabilita.filtri.v1";
const TIPI_PERIODO: TipoPeriodo[] = ["giorno", "settimana", "mese", "anno", "periodo"];
const TIPI: (Tipo | "")[] = ["", "RICAVO", "COSTO_VARIABILE", "COSTO_FISSO"];

export function magazzinoBrowser(): Magazzino | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Ogni valore si controlla da solo: uno rovinato si scarta, gli altri restano.
export function leggiFiltri(magazzino: Magazzino | null = magazzinoBrowser()): FiltriSalvati {
  if (!magazzino) return {};
  let grezzo: unknown;
  try {
    const testo = magazzino.getItem(CHIAVE);
    if (!testo) return {};
    grezzo = JSON.parse(testo);
  } catch {
    return {};
  }
  if (typeof grezzo !== "object" || grezzo === null) return {};
  const o = grezzo as Record<string, unknown>;
  const filtri: FiltriSalvati = {};
  const p = TIPI_PERIODO.find((t) => t === o.p);
  if (p) filtri.p = p;
  for (const campo of ["r", "da", "a"] as const) {
    const valore = o[campo];
    if (typeof valore === "string" && dataValida(valore)) filtri[campo] = valore;
  }
  const tipo = TIPI.find((t) => t === o.tipo);
  if (tipo !== undefined) filtri.tipo = tipo;
  if (Array.isArray(o.categorie)) {
    filtri.categorie = o.categorie.filter((n): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0);
  }
  return filtri;
}

// I salvataggi si sommano: chi scrive il periodo non cancella il tipo e viceversa.
export function salvaFiltri(magazzino: Magazzino | null, nuovi: FiltriSalvati): void {
  if (!magazzino) return;
  try {
    magazzino.setItem(CHIAVE, JSON.stringify({ ...leggiFiltri(magazzino), ...nuovi }));
  } catch {
    // niente da fare: si ricomincia dai valori predefiniti
  }
}

// Dopo aver salvato un movimento: se la sua data non cade nel periodo che si sta guardando (quello salvato, uguale in
// Movimenti e Riepilogo), l'elenco sembrerebbe vuoto e il movimento perso. Si porta il periodo sul mese del movimento;
// null = il movimento si vede gia', niente da cambiare. Senza periodo salvato le pagine partono dal mese corrente.
export function periodoDopoSalvataggio(data: string, filtri: FiltriSalvati, oggi: string): FiltriSalvati | null {
  const { da, a } = intervalloSalvato(filtri, oggi);
  return data >= da && data <= a ? null : { p: "mese", r: data };
}

// Il periodo che Movimenti e Riepilogo mostrano con questi filtri salvati.
function intervalloSalvato(filtri: FiltriSalvati, oggi: string): Intervallo {
  const tipo = filtri.p ?? "mese";
  if (tipo !== "periodo") return intervalloDi(tipo, filtri.r ?? oggi);
  const da = filtri.da ?? intervalloDi("mese", oggi).da;
  const a = filtri.a ?? oggi;
  return da <= a ? { da, a } : { da: a, a: da };
}

// Dopo un'importazione di fatture (`date`: le date dei documenti importati): come sopra, ma i documenti sono tanti e di giorni
// diversi. Se il periodo mostrato li contiene gia' tutti non cambia niente (null). Altrimenti si mostra un periodo che li contiene
// TUTTI, cosi' quello che si vede dopo corrisponde a quello che si e' appena importato (stesso numero di documenti, stesso totale):
// - tutti nello stesso mese: quel mese («Ora vedi novembre 2026»), con le frecce per scorrere come sempre;
// - su piu' mesi: il periodo libero dal primo giorno del primo mese all'ultimo giorno dell'ultimo («Ora vedi da ottobre a novembre
//   2026»). Il solo mese della fattura piu' recente lascerebbe fuori le altre, e sembrerebbero perse.
// `etichetta` e' il testo per l'avviso, in minuscolo.
export function periodoDopoImportazione(date: readonly string[], filtri: FiltriSalvati, oggi: string): { filtri: FiltriSalvati; etichetta: string } | null {
  const valide = date.filter(dataValida).sort();
  const prima = valide[0];
  const ultima = valide[valide.length - 1];
  if (prima === undefined || ultima === undefined) return null;
  const mostrato = intervalloSalvato(filtri, oggi);
  if (prima >= mostrato.da && ultima <= mostrato.a) return null;
  const meseAnno = (iso: string) => `${nomeMese(iso)} ${iso.slice(0, 4)}`;
  if (prima.slice(0, 7) === ultima.slice(0, 7)) return { filtri: { p: "mese", r: ultima }, etichetta: meseAnno(ultima) };
  const stessoAnno = prima.slice(0, 4) === ultima.slice(0, 4);
  return {
    filtri: { p: "periodo", da: intervalloDi("mese", prima).da, a: intervalloDi("mese", ultima).a },
    etichetta: `da ${stessoAnno ? nomeMese(prima) : meseAnno(prima)} a ${meseAnno(ultima)}`,
  };
}

// Un filtro salvato puo' nominare voci che non esistono piu' (eliminate o unite): quegli id si scartano, gli altri restano.
// Senza l'elenco delle voci (non ancora caricato) non si scarta niente.
export function scartaIdInesistenti(ids: readonly number[], esistenti: readonly { id: number }[] | undefined): number[] {
  if (!esistenti) return [...ids];
  const buoni = new Set(esistenti.map((x) => x.id));
  return ids.filter((id) => buoni.has(id));
}
