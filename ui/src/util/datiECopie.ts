// I testi di Impostazioni › Dati e copie. Nell'app vera i dati stanno sul computer del locale e ogni notte se ne fa una copia; la demo
// (docs/demo.md) gira tutta nel browser, anche dal telefono, e le copie non esistono: li' si dice solo quello che e' vero.

export function doveSonoIDati(demo: boolean): string {
  return demo ? "Solo su questo dispositivo, mai online" : "Solo su questo computer, mai online";
}

// La riga «Copie di sicurezza» della demo, al posto di ultima copia, ripristino e cartella (che nella demo non fanno niente).
export const COPIE_NELLA_DEMO = "Nella demo non si fanno. Nell'app vera se ne fa una ogni notte alle 03:00 e puoi farne una quando vuoi.";
