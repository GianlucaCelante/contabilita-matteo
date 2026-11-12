// I testi di Impostazioni › Dati e copie. Nell'app vera i dati stanno sul computer del locale e ogni notte se ne fa una copia; la demo
// (docs/demo.md) gira tutta nel browser, anche dal telefono, e le copie non esistono: li' si dice solo quello che e' vero.

import { NOME_PROGRAMMA } from "./nomeProgramma";

export function doveSonoIDati(demo: boolean): string {
  return demo ? "Solo su questo dispositivo, mai online" : "Solo su questo computer, mai online";
}

// L'ultima riga, nell'app e nella demo: l'unico posto dentro l'app dove si legge come si chiama il programma (si vede solo
// dopo l'accesso: la schermata della password non lo dice). «<nome> · versione 0.1.0»; la demo non ha una versione.
export const ETICHETTA_PROGRAMMA = "Programma";

export function programmaEVersione(versione: string | undefined, demo: boolean): string {
  if (demo) return `${NOME_PROGRAMMA} · demo`;
  const v = versione?.trim();
  return v ? `${NOME_PROGRAMMA} · versione ${v}` : NOME_PROGRAMMA;
}

// La riga «Copie di sicurezza» della demo, al posto di ultima copia, ripristino e cartella (che nella demo non fanno niente).
export const COPIE_NELLA_DEMO = "Nella demo non si fanno. Nell'app vera se ne fa una ogni notte alle 03:00 e puoi farne una quando vuoi.";
