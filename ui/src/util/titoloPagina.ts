import { NOME_PROGRAMMA } from "./nomeProgramma";

// Il titolo della scheda finche' non si e' dentro: caricamento, errore del Cancello, schermata della password (e l'avvio della
// demo). Non deve dire cos'e' l'app, quindi niente nome del programma. `index.html` non puo' importarlo e lo ripete nel suo
// <title>: nomeProgramma.test.ts controlla che siano uguali. Dopo l'accesso i titoli sono «<vista> · <nome>» (Guscio).
export const TITOLO_PRIMA_DELL_ACCESSO = "Area soci · Calcio";

// I titoli delle viste, per la scheda del browser: «<titolo> · Fuorigioco» (le viste con un nome proprio, come il dettaglio
// di una voce, lo impostano da sole con useTitoloPagina).
const TITOLI_PAGINA: [string, string][] = [
  ["/movimenti/nuovo", "Nuovo movimento"],
  ["/movimenti/importa", "Importa fatture"],
  ["/movimenti/", "Movimento"],
  ["/movimenti", "Movimenti"],
  ["/statistiche/pizze-ordini", "Pizze e ordini"],
  ["/statistiche/voci/dettaglio", "Dettaglio voce"],
  ["/statistiche/voci", "Costi e ricavi per voce"],
  ["/statistiche/fatture", "Fatture"],
  ["/statistiche", "Statistiche"],
  ["/riepilogo", "Riepilogo"],
  ["/esporta", "Esporta"],
  ["/impostazioni", "Impostazioni"],
];

// Il titolo della vista; stringa vuota se il percorso non e' noto.
export function titoloPer(percorso: string): string {
  return TITOLI_PAGINA.find(([p]) => percorso === p || (p.endsWith("/") && percorso.startsWith(p)))?.[1] ?? "";
}

export function titoloDocumento(titolo: string): string {
  return titolo ? `${titolo} · ${NOME_PROGRAMMA}` : NOME_PROGRAMMA;
}

// Le viste che scrivono da sole il titolo (con il nome di cio' che mostrano): il Guscio non lo tocca, cosi' non lo sovrascrive.
export function titoloDellaVista(percorso: string): boolean {
  return percorso === "/statistiche/voci/dettaglio";
}
