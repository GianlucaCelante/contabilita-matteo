// Dove sta l'avviso in basso e quando il mouse lo ferma (componenti/Avviso.tsx). Qui solo la logica, senza DOM, provata dai test.

export interface Rettangolo {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// I pulsanti di azione di un modulo (la riga «Annulla | Salva e aggiungine un altro | Salva» sul computer, la barra fissa sul telefono):
// l'avviso non deve coprirli, perche' subito dopo un salvataggio sono proprio quelli che si vogliono premere di nuovo.
// Allo stesso modo non copre quello che e' marcato `data-non-coprire`: la barra dei totali Ricavi / Costi / Saldo di Movimenti (sul
// computer e sul telefono), che si vuole leggere proprio dopo aver segnato una fattura come pagata o essere tornati da un salvataggio.
export const SELETTORE_DA_NON_COPRIRE = "[data-azioni-modulo], [data-non-coprire]";

// I pulsanti stretti che stanno a un lato dello schermo, sopra le barre: il «+» tondo del telefono (Guscio.tsx). L'avviso non ci sale
// sopra (finirebbe a meta' schermo, sull'elenco): gli si mette di fianco, stringendosi (`postoAvviso`).
export const SELETTORE_DA_AFFIANCARE = "[data-avviso-di-fianco]";

const siToccano = (a: Rettangolo, b: Rettangolo) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// Di quanti px alzare l'avviso (dalla posizione di partenza `avviso`) perche' non copra nessuno degli `ostacoli`: sale fin sopra quelli
// che tocca, con `margine`, e ricontrolla dalla nuova posizione. 0 se non tocca niente, o se sopra non c'e' posto.
export function quantoAlzare(avviso: Rettangolo, ostacoli: readonly Rettangolo[], margine = 12): number {
  let alzata = 0;
  for (let giro = 0; giro <= ostacoli.length; giro++) {
    // campo per campo: un DOMRect ha i lati come getter del prototipo, che `{ ...avviso }` non copierebbe
    const spostato = { left: avviso.left, right: avviso.right, top: avviso.top - alzata, bottom: avviso.bottom - alzata };
    const toccati = ostacoli.filter((o) => siToccano(spostato, o));
    if (toccati.length === 0) break;
    alzata = avviso.bottom - Math.min(...toccati.map((o) => o.top)) + margine;
  }
  return avviso.top - alzata < 0 ? 0 : alzata;
}

export interface OpzioniPosto {
  // Quanto l'avviso sta staccato dalle barre (sopra) e dai pulsanti a cui sale sopra.
  margine?: number;
  // Quanto sta staccato da un pulsante che ha di fianco: piu' del margine sopra, perche' li' c'e' la X dell'avviso, con la sua area di
  // tocco, e accanto il «+»: due bersagli vicini si sbagliano.
  margineLato?: number;
  // Quanto dell'avviso non e' testo (margini interni, X, icona dell'errore), in larghezza.
  ingombro?: number;
  // Lo spazio minimo che deve restare al testo perche' l'avviso si metta di fianco al pulsante.
  testoMinimo?: number;
}

export interface Posto {
  alzata: number;
  stretta: number;
}

// Dove mettere l'avviso in basso. `barre` sono gli ostacoli larghi (pulsanti dei moduli, barra dei totali): l'avviso ci sale sopra,
// come in `quantoAlzare`. `pulsanti` sono quelli stretti sul lato destro (il «+» del telefono): se, una volta salito, l'avviso ne
// toccherebbe uno, il lato destro della zona (`zona`: i lati sinistro e destro di dove l'avviso puo' stare) rientra fino a
// `margineLato` px a sinistra del pulsante, e l'avviso va a capo dentro lo spazio che resta. `stretta` e' di quanti px rientra il lato
// destro. Se cosi' al testo (la zona stretta meno `ingombro`) restano meno di `testoMinimo` px, l'avviso sale sopra anche al pulsante,
// largo quanto la zona; e se sopra non c'e' posto resta almeno sopra le barre.
export function postoAvviso(avviso: Rettangolo, zona: Pick<Rettangolo, "left" | "right">, barre: readonly Rettangolo[], pulsanti: readonly Rettangolo[], opzioni: OpzioniPosto = {}): Posto {
  const { margine = 12, margineLato = 20, ingombro = 0, testoMinimo = 140 } = opzioni;
  const alzata = quantoAlzare(avviso, barre, margine);
  const spostato = { left: avviso.left, right: avviso.right, top: avviso.top - alzata, bottom: avviso.bottom - alzata };
  const toccati = pulsanti.filter((p) => siToccano(spostato, p));
  if (toccati.length === 0) return { alzata, stretta: 0 };
  const destra = Math.min(...toccati.map((p) => p.left)) - margineLato;
  if (destra - zona.left - ingombro >= testoMinimo) return { alzata, stretta: Math.max(0, zona.right - destra) };
  return sopraIPulsanti(avviso, barre, pulsanti, margine) ?? { alzata, stretta: 0 };
}

// L'avviso largo quanto la zona, sopra le barre e anche sopra i pulsanti di fianco. `null` se sopra non c'e' posto (uscirebbe dallo
// schermo): chi chiama decide il ripiego.
export function sopraIPulsanti(avviso: Rettangolo, barre: readonly Rettangolo[], pulsanti: readonly Rettangolo[], margine = 12): Posto | null {
  const ostacoli = [...barre, ...pulsanti];
  const alzata = quantoAlzare(avviso, ostacoli, margine);
  const spostato = { left: avviso.left, right: avviso.right, top: avviso.top - alzata, bottom: avviso.bottom - alzata };
  return ostacoli.some((o) => siToccano(spostato, o)) ? null : { alzata, stretta: 0 };
}

// L'avviso stretto di fianco a un pulsante manda il testo a capo: oltre `righeMassime` righe copre troppo elenco (a 320 px un avviso
// lungo arrivava a 6-7 righe). `altezzaTesto` e `altezzaRiga` nella stessa unita'; mezza riga di tolleranza per gli arrotondamenti.
// Un'altezza di riga che non si conosce (0, NaN) non fa cambiare niente.
export function troppeRighe(altezzaTesto: number, altezzaRiga: number, righeMassime = 3): boolean {
  if (!Number.isFinite(altezzaRiga) || altezzaRiga <= 0) return false;
  return altezzaTesto > altezzaRiga * (righeMassime + 0.5);
}

// Il nuovo «bottom» (o «right») della zona degli avvisi, in px della pagina: il valore del CSS piu' lo spostamento. `alzata` viene dai
// rettangoli misurati sullo schermo; se la pagina e' rimpicciolita (index.css, solo col layout da computer, da 1024 px di larghezza:
// `html { zoom: 0.92 }` con la larghezza fino a 1366 px o l'altezza fino a 760 px, `0.84` fino a 1180 px o 680 px, `0.76` con l'altezza
// fino a 600 px; basta una delle due misure) un px della pagina vale `zoom` px dello schermo, quindi l'alzata si divide per lo zoom:
// altrimenti l'avviso salirebbe meno del dovuto e il margine sparirebbe. Sotto i 1024 px (layout da telefono) lo zoom e' sempre 1.
// Zoom sconosciuto o non valido = 1.
export function fondoZona(fondoCss: number, alzata: number, zoom?: number): number {
  const z = zoom !== undefined && Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return fondoCss + alzata / z;
}

// Il mouse si e' mosso davvero: la posizione e' cambiata, o prima non si sapeva dov'era. Il browser manda eventi «sintetici» con la
// stessa posizione quando la pagina cambia sotto il puntatore fermo: quelli non contano.
export function puntatoreMosso(prima: { x: number; y: number } | null, adesso: { x: number; y: number }): boolean {
  return prima === null || prima.x !== adesso.x || prima.y !== adesso.y;
}

// Il mouse sopra l'avviso ferma il tempo, ma solo se si e' MOSSO dopo la comparsa. Un avviso che compare (o scivola) sotto il puntatore
// fermo riceve lo stesso un «ingresso»: quello non conta, altrimenti l'avviso resterebbe li' finche' il mouse non si sposta. La regola
// non guarda la geometria (l'avviso si sposta subito dopo la comparsa, e la posizione ricordata del mouse puo' essere vecchia): conta
// solo `mossoDopoLaComparsa`. Con il mouse fermo sopra dall'inizio, il primo movimento dentro l'avviso («muove») lo ferma.
// `fermo`: il tempo e' fermo per via del mouse; solo allora l'uscita lo fa ripartire.
export function fermaAlPassaggio(fermo: boolean, mossoDopoLaComparsa: boolean, evento: "entra" | "muove" | "esce"): { ferma?: true; riprendi?: true; fermo: boolean } {
  if (evento === "esce") return fermo ? { riprendi: true, fermo: false } : { fermo: false };
  if (fermo || !mossoDopoLaComparsa) return { fermo };
  return { ferma: true, fermo: true };
}
