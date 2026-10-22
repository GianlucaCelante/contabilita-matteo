import { useEffect, useRef, type ComponentType, type MouseEvent } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import ErroreVista from "./ErroreVista";
import { IconaEsporta, IconaImpostazioni, IconaMarchio, IconaMovimenti, IconaPiu, IconaRiepilogo, type ProprietaIcona } from "./Icone";

interface Voce {
  percorso: string;
  etichetta: string;
  Icona: ComponentType<ProprietaIcona>;
  // Solo sul computer: sul telefono la barra ha tre voci.
  soloComputer?: boolean;
}

const VOCI: Voce[] = [
  { percorso: "/riepilogo", etichetta: "Riepilogo", Icona: IconaRiepilogo },
  { percorso: "/movimenti", etichetta: "Movimenti", Icona: IconaMovimenti },
  { percorso: "/esporta", etichetta: "Esporta", Icona: IconaEsporta },
  { percorso: "/impostazioni", etichetta: "Impostazioni", Icona: IconaImpostazioni, soloComputer: true },
];

const TITOLI_PAGINA: [string, string][] = [
  ["/movimenti/nuovo", "Nuovo movimento"],
  ["/movimenti/importa", "Importa fatture"],
  ["/movimenti/", "Movimento"],
  ["/movimenti", "Movimenti"],
  ["/riepilogo", "Riepilogo"],
  ["/esporta", "Esporta"],
  ["/impostazioni", "Impostazioni"],
];

function titoloPer(percorso: string): string {
  return TITOLI_PAGINA.find(([p]) => percorso === p || (p.endsWith("/") && percorso.startsWith(p)))?.[1] ?? "Contabilità";
}

// Impianto della pagina: barra laterale larga 88 px sul computer, barra in
// basso sul telefono (la scelta la fa il CSS con la media query "md"), con il
// pulsante tondo «+» per il nuovo movimento in Riepilogo e Movimenti.
// Il nuovo movimento e il suo dettaglio stanno sotto /movimenti: la voce
// Movimenti resta evidenziata (NavLink senza "end").
export default function Guscio() {
  const posizione = useLocation();
  const rifPrincipale = useRef<HTMLElement | null>(null);
  const percorsoPrecedente = useRef(posizione.pathname);
  const titolo = titoloPer(posizione.pathname);

  useEffect(() => {
    document.title = `${titolo} · Contabilità`;
  }, [titolo]);

  // A ogni cambio di vista il fuoco va alla regione principale, cosi' il Tab
  // riparte dal primo controllo della vista nuova. Non alla prima apertura.
  useEffect(() => {
    if (percorsoPrecedente.current === posizione.pathname) return;
    percorsoPrecedente.current = posizione.pathname;
    rifPrincipale.current?.focus({ preventScroll: true });
    rifPrincipale.current?.scrollTo({ top: 0 });
  }, [posizione.pathname]);

  const saltaAlContenuto = (evento: MouseEvent<HTMLAnchorElement>) => {
    evento.preventDefault();
    rifPrincipale.current?.focus();
  };

  const mostraNuovo = posizione.pathname === "/riepilogo" || posizione.pathname === "/movimenti";

  return (
    <div className="fixed inset-0 flex flex-col md:flex-row">
      <a href="#contenuto" className="saltaAlContenuto" onClick={saltaAlContenuto}>
        Salta al contenuto
      </a>

      {/* Il menu sta nel DOM prima del contenuto: con Tab ci si arriva subito.
          Sul computer e' la barra a sinistra (order-first), sul telefono quella in basso. */}
      <nav
        aria-label="Sezioni dell'app"
        className="order-last flex shrink-0 items-stretch justify-around border-t border-bordo bg-crema px-2 pb-[env(safe-area-inset-bottom)] md:order-first md:w-[88px] md:flex-col md:items-center md:justify-start md:gap-2 md:border-r md:border-t-0 md:px-0 md:py-4"
      >
        <div className="mb-3 hidden h-11 w-11 items-center justify-center rounded-xl bg-verde text-white md:flex" aria-hidden="true">
          <IconaMarchio larghezza={24} spessoreTratto={2} />
        </div>
        {VOCI.map(({ percorso, etichetta, Icona, soloComputer }) => (
          <NavLink
            key={percorso}
            to={percorso}
            className={({ isActive }) =>
              "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[12px] font-bold no-underline md:h-16 md:w-[72px] md:flex-none " +
              (soloComputer ? "hidden md:flex " : "") +
              (isActive ? "bg-verdechiaro text-verdescuro" : "text-spento hover:bg-sabbia")
            }
          >
            <Icona />
            <span>{etichetta}</span>
          </NavLink>
        ))}
      </nav>

      <main id="contenuto" ref={rifPrincipale} tabIndex={-1} aria-label={titolo} className="relative min-h-0 min-w-0 flex-1 overflow-y-auto outline-none">
        <ErroreVista key={posizione.pathname}>
          <Outlet />
        </ErroreVista>
      </main>

      {mostraNuovo && (
        <Link
          to="/movimenti/nuovo"
          aria-label="Nuovo movimento"
          className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-verde text-white shadow-ombra md:hidden"
        >
          <IconaPiu larghezza={26} spessoreTratto={2.25} />
        </Link>
      )}
    </div>
  );
}
