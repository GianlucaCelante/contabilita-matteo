// Dopo «Nuovo movimento» o «Importa fatture»: che cosa fare se il movimento e' finito su una sede che il selettore non sta mostrando.
// Prima l'avviso diceva «Ora vedi novembre 2026» e spostava il periodo, ma con un'altra sede selezionata il movimento non compariva.
//
// La regola: la selezione delle sedi SEGUE il movimento, come gia' fa il periodo. Quello che si e' appena salvato si deve vedere, e
// l'avviso dice che cosa e' cambiato («Ora vedi novembre 2026, con Lungomare.»). La sede si AGGIUNGE a quelle selezionate (non le
// sostituisce): quello che si stava guardando resta.
// Un'eccezione: una sede PERSONALE non si accende mai da sola. Accenderla mescolerebbe le spese dei titolari ai totali del locale
// (Riepilogo, statistiche, Esporta) senza che nessuno l'abbia chiesto: e' la regola di tutta l'app, «una personale entra nella selezione
// solo se la si accende a mano». Per lei l'avviso dice dov'e' il movimento: «È su Casa (personale), che ora non stai guardando.».
import type { Sede } from "../api/tipi";
import { conSelettore, normalizzaScelta, sediSelezionabili, type Scelta } from "./sedi";

export interface SediDopoSalvataggio {
  // Le sedi del locale da accendere (id, nell'ordine del selettore) e i loro nomi, per l'avviso.
  daAggiungere: number[];
  aggiunte: string[];
  // Le sedi personali su cui e' finito qualcosa e che restano spente: solo i nomi, per l'avviso.
  nonMostrate: string[];
}

const NIENTE: SediDopoSalvataggio = { daAggiungere: [], aggiunte: [], nonMostrate: [] };

// `selezionate`: gli id che il selettore mostra adesso (con «Tutte le sedi» sono quelli del locale). `idMovimenti`: le sedi dei
// movimenti appena creati (una; piu' d'una con «dividi»; la stessa per tutte le fatture importate). Senza selettore (una sola sede
// sceglibile) non c'e' niente da seguire.
export function sediDopoSalvataggio(sedi: readonly Sede[], selezionate: readonly number[], idMovimenti: readonly number[]): SediDopoSalvataggio {
  if (!conSelettore(sedi)) return NIENTE;
  const mancanti = sediSelezionabili(sedi).filter((s) => idMovimenti.includes(s.id) && !selezionate.includes(s.id));
  const locale = mancanti.filter((s) => !s.personale);
  return {
    daAggiungere: locale.map((s) => s.id),
    aggiunte: locale.map((s) => s.nome),
    nonMostrate: mancanti.filter((s) => s.personale).map((s) => s.nome),
  };
}

// La selezione da salvare dopo aver acceso quelle sedi: se diventa esattamente il locale torna «tutte» (null), come nel selettore.
export function sceltaConSedi(sedi: readonly Sede[], selezionate: readonly number[], daAggiungere: readonly number[]): Scelta {
  return normalizzaScelta(sedi, [...selezionate, ...daAggiungere]);
}

const elenco = (nomi: readonly string[]) => (nomi.length <= 1 ? (nomi[0] ?? "") : `${nomi.slice(0, -1).join(", ")} e ${nomi[nomi.length - 1]}`);

// La coda degli avvisi (con lo spazio davanti; vuota se non c'e' niente da dire): il periodo, se e' stato spostato, e le sedi.
// `cosa`: "uno" = un movimento solo; "parte" = le parti di un movimento diviso; "piu" = piu' documenti importati sulla stessa sede.
export function fraseOraVedi(periodo: string | null, sedi: SediDopoSalvataggio | null | undefined, cosa: "uno" | "parte" | "piu"): string {
  const aggiunte = sedi?.aggiunte ?? [];
  const nonMostrate = sedi?.nonMostrate ?? [];
  let testo = "";
  if (periodo) testo += ` Ora vedi ${periodo}${aggiunte.length > 0 ? `, con ${elenco(aggiunte)}` : ""}.`;
  else if (aggiunte.length > 0) testo += ` Ora vedi anche ${elenco(aggiunte)}.`;
  if (nonMostrate.length > 0) {
    const inizio = cosa === "uno" ? "È su" : cosa === "parte" ? "Una parte è su" : "Sono su";
    testo += ` ${inizio} ${elenco(nonMostrate.map((n) => `${n} (personale)`))}, che ora non stai guardando.`;
  }
  return testo;
}

// La sede in cui un'importazione mette le fatture: quella scelta nella schermata; senza scelta (con una sola sede attiva la schermata
// non la chiede) e' l'unica attiva, perche' il servizio usa quella (docs/api.md, «Quale sede»). Null se non si puo' sapere.
export function sedeDellImportazione(attive: readonly Pick<Sede, "id">[], sedeScelta: number | null): number | null {
  if (sedeScelta !== null) return sedeScelta;
  return attive.length === 1 ? attive[0]!.id : null;
}
