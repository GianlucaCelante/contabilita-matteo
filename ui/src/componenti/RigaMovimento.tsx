import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Movimento } from "../api/tipi";
import { aumentaIlSaldo, CLASSE_TIPO, documentoConNumero, nomeMovimento, NOME_ORIGINE, sottotitoloMovimento, sottotitoloTelefono, TIPO_BREVE } from "../util/etichette";
import { dataBreve, dataGiorno, dataRiga, euroConSegno } from "../util/formato";
import BadgePagata from "./BadgePagata";
import BadgeSede from "./BadgeSede";

// Le righe dell'elenco dei movimenti, raggruppate per giorno: le usano Movimenti e il dettaglio di una voce delle statistiche.

interface ProprietaRiga {
  m: Movimento;
  conAnno: boolean;
  conSede: boolean;
  daDove?: string;
}

// «Segna pagata» dell'elenco (hooks/useSegnaPagata.ts, `useSegnaPagataInElenco`): l'azione e la fattura che sta salvando.
export interface PagataInElenco {
  cambia: (m: Movimento) => void;
  occupataId: number | null;
}

const CLASSE_NOME = "block truncate text-[16px] font-bold max-[359px]:line-clamp-2 max-[359px]:whitespace-normal md:text-[15px]";

// Nome e sottotitoli. `nome` e' il testo o, per le fatture, il collegamento della riga; `pagata` (solo fatture) e' il comando
// «Da pagare / Pagata», che sul telefono prende il posto di «Variabile» (una fattura e' sempre un costo variabile: la riga non si stringe).
function Testi({ m, nome, pagata }: { m: Movimento; nome: ReactNode; pagata?: ReactNode }) {
  const sotto = sottotitoloMovimento(m);
  const sottoTelefono = sottotitoloTelefono(m);
  return (
    <span className="min-w-0">
      {nome}
      {(sotto || pagata) && (
        <span className="flex items-center gap-2 text-[13px] text-spento max-md:hidden">
          {sotto && <span className="min-w-0 truncate">{sotto}</span>}
          {pagata}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-x-1 text-[13px] text-spento md:hidden">
        {sottoTelefono.documento && (
          <>
            <span className={"min-w-0 max-[359px]:whitespace-normal max-[359px]:break-words " + (pagata ? "" : "truncate")}>{sottoTelefono.documento}</span>
            {!pagata && <span aria-hidden="true">·</span>}
          </>
        )}
        {pagata ?? <span className="shrink-0">{sottoTelefono.tipo}</span>}
      </span>
    </span>
  );
}

// Le sei celle della riga (sul telefono se ne vedono due: i testi e l'importo).
function Celle({ m, conAnno, conSede, testi }: { m: Movimento; conAnno: boolean; conSede: boolean; testi: ReactNode }) {
  const ricavo = aumentaIlSaldo(m);
  return (
    <>
      <span className="num text-[15px] max-md:hidden">{dataRiga(m.data, conAnno)}</span>
      <span className="max-md:hidden">
        <span className={"etichettaTipo " + CLASSE_TIPO[m.tipo]}>{TIPO_BREVE[m.tipo]}</span>
      </span>
      {conSede ? (
        <span className="flex min-w-0 items-center gap-2.5">
          <BadgeSede id={m.sede.id} taglia="grande" decorativo />
          {testi}
        </span>
      ) : (
        testi
      )}
      <span className="truncate text-[15px] max-md:hidden">{documentoConNumero(m)}</span>
      <span className={"num text-right text-[16px] font-bold md:text-[15px] " + (ricavo ? "text-verdescuro" : "")}>{euroConSegno(m.importoCent, ricavo)}</span>
      <span className="text-right text-[13px] text-spento max-md:hidden">{NOME_ORIGINE[m.origine]}</span>
    </>
  );
}

const etichettaRiga = (m: Movimento, conSede: boolean, stato = "") =>
  `${nomeMovimento(m)}, ${dataBreve(m.data)}, ${euroConSegno(m.importoCent, aumentaIlSaldo(m))}${conSede ? `, sede ${m.sede.nome}` : ""}${stato}. Apri il dettaglio`;

// Una fattura ricevuta: oltre ad aprire il dettaglio ha il comando «Da pagare / Pagata» (un tocco cambia lo stato). Due comandi non
// possono stare uno dentro l'altro: qui il collegamento e' solo il nome, ma la sua area copre tutta la riga (`.rigaFattura` in
// index.css), e il pulsante sta sopra, fuori dal collegamento, dov'era il badge. La griglia e le misure sono quelle delle altre righe.
function RigaFattura({ m, conAnno, conSede, daDove, pagata: azione }: ProprietaRiga & { pagata: PagataInElenco }) {
  // Si salva una fattura alla volta: mentre una salva, i badge di tutte le righe ignorano il tocco, e lo dicono (aria-disabled su
  // tutti, non solo su quello che salva: un comando che non risponde non deve sembrare attivo).
  const occupata = azione.occupataId !== null;
  const pagata = (
    <button
      type="button"
      className="pulsantePagata shrink-0 max-md:ml-0.5 max-md:self-center"
      aria-label={`Fattura di ${nomeMovimento(m)}: ${m.pagata ? "pagata. Segna come da pagare" : "da pagare. Segna come pagata"}`}
      title={m.pagata ? "Segna come da pagare" : "Segna come pagata"}
      // Mentre salva non e' `disabled` (un pulsante spento perde il fuoco, che finirebbe su <body>): si ignora il secondo tocco.
      aria-disabled={occupata || undefined}
      onClick={() => {
        if (!occupata) azione.cambia(m);
      }}
    >
      <BadgePagata pagata={m.pagata} piccolo />
    </button>
  );
  const nome = (
    <Link
      to={`/movimenti/${m.id}`}
      {...(daDove ? { state: { da: daDove } } : {})}
      data-movimento={m.id}
      className={"collegamentoRiga " + CLASSE_NOME}
      aria-label={etichettaRiga(m, conSede, m.pagata ? ", pagata" : ", da pagare")}
    >
      {nomeMovimento(m)}
    </Link>
  );
  return (
    <li className="riga rigaFattura">
      <div className="rigaMov">
        <Celle m={m} conAnno={conAnno} conSede={conSede} testi={<Testi m={m} nome={nome} pagata={pagata} />} />
      </div>
    </li>
  );
}

// Le date di riga sono brevi (gg/mm); con l'anno (gg/mm/aa) quando il periodo e' un anno o un intervallo libero.
// `conSede`: con almeno due sedi attive la riga porta il badge-lettera della sede; con una sola resta com'era.
export function RigaMovimento({ m, conAnno, conSede, daDove, pagata }: ProprietaRiga & { pagata: PagataInElenco }) {
  // Solo le fatture ricevute hanno lo stato «Da pagare» / «Pagata».
  if (m.tipo === "COSTO_VARIABILE" && m.documento === "FATTURA") return <RigaFattura m={m} conAnno={conAnno} conSede={conSede} pagata={pagata} {...(daDove ? { daDove } : {})} />;
  return (
    <li className="riga">
      <Link to={`/movimenti/${m.id}`} {...(daDove ? { state: { da: daDove } } : {})} data-movimento={m.id} className="rigaMov" aria-label={etichettaRiga(m, conSede)}>
        <Celle m={m} conAnno={conAnno} conSede={conSede} testi={<Testi m={m} nome={<span className={CLASSE_NOME}>{nomeMovimento(m)}</span>} />} />
      </Link>
    </li>
  );
}

// L'intestazione delle colonne (solo computer).
export function IntestazioneElenco() {
  return (
    <div className="intestazioneTabella etichettaMaiuscola grid h-[42px] items-center gap-3 px-5 max-md:hidden">
      <span>Data</span>
      <span>Tipo</span>
      <span>Fornitore / descrizione</span>
      <span>Documento</span>
      <span className="text-right">Importo</span>
      <span className="text-right">
        <span className="sr-only">Origine</span>
      </span>
    </div>
  );
}

// Le righe per giorno, con la data in testa a ogni gruppo. `daDove`: l'indirizzo a cui riporta la freccia indietro del dettaglio.
// `pagata`: il «Segna pagata» delle fatture, uno per tutto l'elenco (lo tiene la vista, che resta anche quando l'elenco si svuota).
export function ElencoPerGiorno({ elementi, conAnno, conSede, daDove, pagata }: { elementi: Movimento[]; conAnno: boolean; conSede: boolean; daDove?: string; pagata: PagataInElenco }) {
  const gruppi = useMemo(() => {
    const mappa = new Map<string, Movimento[]>();
    for (const m of elementi) {
      const lista = mappa.get(m.data);
      if (lista) lista.push(m);
      else mappa.set(m.data, [m]);
    }
    return [...mappa.entries()];
  }, [elementi]);
  return (
    <>
      {gruppi.map(([data, righe]) => (
        <section key={data} aria-label={dataGiorno(data)}>
          <h2 className="etichettaMaiuscola flex h-[34px] items-center bg-sabbia px-4 !font-testo md:h-9 md:border-t md:border-riga md:px-5 md:text-[13px]">{dataGiorno(data)}</h2>
          <ul className="m-0 list-none p-0">
            {righe.map((m) => (
              <RigaMovimento key={m.id} m={m} conAnno={conAnno} conSede={conSede} pagata={pagata} {...(daDove ? { daDove } : {})} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
