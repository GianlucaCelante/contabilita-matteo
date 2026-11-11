// Dove mettere il fuoco quando il controllo che lo aveva sparisce (verifica su Chrome, novembre 2026): dopo «Segna tutte pagate» il
// pulsante non c'e' piu', dopo l'eliminazione di una voce la sua riga nemmeno, e il fuoco finiva su <body> o sul contenuto principale.
// Qui c'e' solo la logica (senza DOM, si prova con i test); chi la usa sposta il fuoco nel momento in cui la finestra di conferma si
// chiude, PRIMA che hooks/useModale lo restituisca a chi l'aveva aperta: useModale non tocca un fuoco gia' messo altrove.

// Chi ha aperto una finestra, cioe' a chi torna il fuoco quando si chiude (hooks/useModale): chi aveva il fuoco; se il fuoco non era su
// niente, il controllo premuto un attimo prima; se manca anche quello, chi aveva aperto la finestra che si e' appena chiusa. L'ultimo
// caso e' il cambio di fase di AzioniVoce (matita, poi «Elimina», poi «Annulla», poi «Chiudi»): ogni fase e' una finestra diversa, che si
// apre quando il pulsante premuto nella precedente non c'e' gia' piu'; senza eredita' il fuoco alla fine andava sul contenuto.
export function chiHaAperto<T>(conFuoco: T | null, premutoPocoFa: T | null, dellaFinestraAppenaChiusa: T | null): T | null {
  return conFuoco ?? premutoPocoFa ?? dellaFinestraAppenaChiusa;
}

// L'origine che una finestra in chiusura lascia in eredita' a quella che ne prende il posto. Se nello stesso aggiornamento si chiudono
// due finestre annidate, ognuna vorrebbe scrivere la sua: vince la prima ancora in pagina. L'origine della finestra interna e' un
// pulsante di quella esterna, che sta sparendo con lei: non deve coprire la matita (o il pulsante) che aveva aperto l'esterna.
export function origineInEredita<T>(giaScritta: T | null, nuova: T | null, connesso: (nodo: T) => boolean): T | null {
  return giaScritta !== null && connesso(giaScritta) ? giaScritta : nuova;
}

// La riga vicina a quella che sparisce: la successiva, se era l'ultima la precedente, se era l'unica nessuna.
export function vicinoDi<T>(ordine: readonly T[], voce: T): T | null {
  const posto = ordine.indexOf(voce);
  if (posto < 0) return null;
  return ordine[posto + 1] ?? ordine[posto - 1] ?? null;
}

// Si aspetta che una riga sparisca dopo un salvataggio (una fattura segnata pagata con «Solo da pagare»), per spostare il fuoco. Se la
// riga non c'e' piu' si sposta; se c'e' ancora e il salvataggio e' in corso si aspetta; se c'e' ancora a salvataggio finito (e' fallito)
// l'attesa si annulla: altrimenti il fuoco salterebbe piu' tardi, quando la riga sparisce per un altro motivo.
export function esitoRigaAttesa(rigaPresente: boolean, inCorso: boolean): "sposta" | "aspetta" | "annulla" {
  if (!rigaPresente) return "sposta";
  return inCorso ? "aspetta" : "annulla";
}

// Il fuoco non e' su niente di utile: nessun elemento, il <body>, o il contenuto principale (dove lo lascia useModale quando chi aveva
// aperto la finestra non c'e' piu').
export function fuocoPerso(attivo: { tagName: string; id: string } | null): boolean {
  return attivo === null || attivo.tagName === "BODY" || attivo.id === "contenuto";
}

interface NodoCercabile<T> {
  matches: (selettore: string) => boolean;
  querySelector: (selettore: string) => T | null;
}

const GRUPPO_DI_SCELTE = '[role="radiogroup"], [role="group"]';

// Dopo un errore di validazione il fuoco va sul campo che mostra l'errore. Un campo lo prende lui stesso; un gruppo di scelte
// («Di quale sede») non e' focalizzabile: lo prende la scelta attiva, altrimenti la prima.
export function controlloDellErrore<T extends NodoCercabile<T>>(primo: T): T {
  if (!primo.matches(GRUPPO_DI_SCELTE)) return primo;
  return primo.querySelector('[aria-checked="true"]') ?? primo.querySelector("button") ?? primo;
}

// Come `vicinoDi`, ma guardando l'elenco di DOPO: nell'elenco Movimenti con «Da pagare» acceso la fattura segnata pagata esce
// dall'elenco, e nel frattempo possono essere uscite anche altre righe. Si prende la prima riga dopo quella sparita che c'e' ancora;
// se non ce ne sono, la piu' vicina prima; se non resta niente di quello che c'era, nessuna.
export function vicinoRimasto<T>(prima: readonly T[], voce: T, dopo: readonly T[]): T | null {
  const posto = prima.indexOf(voce);
  if (posto < 0) return null;
  const rimasti = new Set(dopo);
  for (let i = posto + 1; i < prima.length; i++) if (rimasti.has(prima[i]!)) return prima[i]!;
  for (let i = posto - 1; i >= 0; i--) if (rimasti.has(prima[i]!)) return prima[i]!;
  return null;
}
