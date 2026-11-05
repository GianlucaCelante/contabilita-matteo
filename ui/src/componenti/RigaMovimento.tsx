import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Movimento } from "../api/tipi";
import { aumentaIlSaldo, CLASSE_TIPO, documentoConNumero, nomeMovimento, NOME_ORIGINE, sottotitoloMovimento, sottotitoloTelefono, TIPO_BREVE } from "../util/etichette";
import { dataBreve, dataGiorno, dataRiga, euroConSegno } from "../util/formato";
import BadgePagata from "./BadgePagata";
import BadgeSede from "./BadgeSede";

// Le righe dell'elenco dei movimenti, raggruppate per giorno: le usano Movimenti e il dettaglio di una voce delle statistiche.

// Le date di riga sono brevi (gg/mm); con l'anno (gg/mm/aa) quando il periodo e' un anno o un intervallo libero.
// `conSede`: con almeno due sedi attive la riga porta il badge-lettera della sede; con una sola resta com'era.
export function RigaMovimento({ m, conAnno, conSede, daDove }: { m: Movimento; conAnno: boolean; conSede: boolean; daDove?: string }) {
  const ricavo = aumentaIlSaldo(m);
  const sotto = sottotitoloMovimento(m);
  const sottoTelefono = sottotitoloTelefono(m);
  // Solo le fatture ricevute hanno lo stato «Da pagare» / «Pagata».
  const fattura = m.tipo === "COSTO_VARIABILE" && m.documento === "FATTURA";
  const testi = (
    <span className="min-w-0">
      <span className="block truncate text-[16px] font-bold max-[359px]:line-clamp-2 max-[359px]:whitespace-normal md:text-[15px]">{nomeMovimento(m)}</span>
      {(sotto || fattura) && (
        <span className="flex items-center gap-2 text-[13px] text-spento max-md:hidden">
          {sotto && <span className="min-w-0 truncate">{sotto}</span>}
          {fattura && <BadgePagata pagata={m.pagata} piccolo className="shrink-0" />}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-x-1 text-[13px] text-spento md:hidden">
        {sottoTelefono.documento && (
          <>
            <span className={"min-w-0 max-[359px]:whitespace-normal max-[359px]:break-words " + (fattura ? "" : "truncate")}>{sottoTelefono.documento}</span>
            {!fattura && <span aria-hidden="true">·</span>}
          </>
        )}
        {/* Una fattura e' sempre un costo variabile: al posto di «Variabile» c'e' lo stato, cosi' sul telefono la riga non si stringe. */}
        {fattura ? <BadgePagata pagata={m.pagata} piccolo className="ml-0.5 shrink-0 self-center" /> : <span className="shrink-0">{sottoTelefono.tipo}</span>}
      </span>
    </span>
  );
  return (
    <li className="riga">
      <Link
        to={`/movimenti/${m.id}`}
        {...(daDove ? { state: { da: daDove } } : {})}
        className="rigaMov"
        aria-label={`${nomeMovimento(m)}, ${dataBreve(m.data)}, ${euroConSegno(m.importoCent, ricavo)}${conSede ? `, sede ${m.sede.nome}` : ""}${fattura ? (m.pagata ? ", pagata" : ", da pagare") : ""}. Apri il dettaglio`}
      >
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
export function ElencoPerGiorno({ elementi, conAnno, conSede, daDove }: { elementi: Movimento[]; conAnno: boolean; conSede: boolean; daDove?: string }) {
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
              <RigaMovimento key={m.id} m={m} conAnno={conAnno} conSede={conSede} {...(daDove ? { daDove } : {})} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
