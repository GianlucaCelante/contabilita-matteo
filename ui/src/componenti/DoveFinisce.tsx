import { useQuery } from "@tanstack/react-query";
import { api, chiavi } from "../api/client";
import type { Tipo } from "../api/tipi";
import { useDebounced } from "../hooks/useDebounced";
import { useSedi } from "../hooks/useSedi";
import { NOME_DOCUMENTO } from "../util/etichette";
import { dataValida, euro, intervalloDi, leggiEuro, nomeMese, settimanaBreve } from "../util/formato";
import SchedaLaterale, { Riga } from "./SchedaLaterale";
import { categoriaDi, documentoDi, effettoSulTotale, sediDelleDivisione, sediDelMovimento, testoRipetizione, type CampiForm } from "../util/modelloMovimento";

const VOCE_TIPO: Record<Tipo, string> = { RICAVO: "Ricavi", COSTO_VARIABILE: "Costi variabili", COSTO_FISSO: "Costi fissi" };

// Seconda scheda per la retribuzione: quanto costa il dipendente nel mese della data scelta,
// compreso quello che si sta inserendo. Compare solo se il dipendente c'e' gia'.
function CostoDelMese({ campi, sedi }: { campi: CampiForm; sedi: string | undefined }) {
  const nome = useDebounced(campi.dipendente.trim(), 250);
  const mese = dataValida(campi.data) ? intervalloDi("mese", campi.data) : null;
  const dipendenti = useQuery({ queryKey: chiavi.dipendenti(nome), queryFn: () => api.dipendenti(nome), enabled: nome !== "" });
  const dipendente = dipendenti.data?.find((d) => d.nome.toLowerCase() === nome.toLowerCase());
  const filtro = { da: mese?.da, a: mese?.a, dipendente: dipendente?.id, ...(sedi ? { sedi } : {}) };
  const elenco = useQuery({
    queryKey: chiavi.movimenti(filtro),
    queryFn: () => api.movimenti(filtro),
    enabled: mese !== null && dipendente !== undefined,
  });
  if (!mese || !dipendente || !elenco.data || nome.toLowerCase() !== campi.dipendente.trim().toLowerCase()) return null;

  const cent = leggiEuro(campi.importo) ?? 0;
  const somma = (d: string) => elenco.data.elementi.filter((m) => m.documento === d).reduce((t, m) => t + m.importoCent, 0);
  const regolare = somma("RETRIBUZIONE_REGOLARE") + (campi.retribuzione === "REGOLARE" ? cent : 0);
  const extra = somma("RETRIBUZIONE_EXTRA") + (campi.retribuzione === "EXTRA" ? cent : 0);
  return (
    <SchedaLaterale titolo={`${dipendente.nome} · ${nomeMese(campi.data)}`} etichetta="Costo del mese">
      <Riga nome="Regolare" primo>
        <span className="num">{euro(regolare)}</span>
      </Riga>
      <Riga nome="Extra">
        <span className="num">{euro(extra)}</span>
      </Riga>
      <Riga nome={<b>Costo del mese</b>}>
        <b className="num">{euro(regolare + extra)}</b>
      </Riga>
    </SchedaLaterale>
  );
}

// Totale della settimana prima e dopo questo movimento, sulle sedi dove finisce (`sedi`; senza: le sedi del locale).
// Una nota di credito lo fa scendere.
function TotaleSettimana({ campi, sedi }: { campi: CampiForm; sedi: string | undefined }) {
  const settimana = dataValida(campi.data) ? intervalloDi("settimana", campi.data) : null;
  const q = useQuery({
    queryKey: chiavi.riepilogo(settimana?.da ?? "", settimana?.a ?? "", sedi),
    queryFn: () => api.riepilogo(settimana!.da, settimana!.a, sedi),
    enabled: settimana !== null,
  });
  const cent = leggiEuro(campi.importo);
  const r = q.data;
  const prima = r ? (campi.tipo === "RICAVO" ? r.ricavi.totaleCent : campi.tipo === "COSTO_VARIABILE" ? r.costiVariabili.totaleCent : r.costiFissi.totaleCent) : null;
  return (
    <SchedaLaterale titolo={`${VOCE_TIPO[campi.tipo]} della settimana`} etichetta="Totale della settimana">
      {q.isPending && settimana && <p className="m-0 text-[14px] text-spento">Calcolo…</p>}
      {q.isError && <p className="m-0 text-[14px] text-spento">Non riesco a calcolare il totale.</p>}
      {prima !== null && (
        <>
          <Riga nome="Prima" primo>
            <span className="num">{euro(prima)}</span>
          </Riga>
          <Riga nome="Con questo movimento">
            <b className="num whitespace-nowrap">{euro(prima + effettoSulTotale(campi, cent ?? 0))}</b>
          </Riga>
        </>
      )}
    </SchedaLaterale>
  );
}

// Colonna laterale (solo computer largo): dove viene contato il movimento e l'effetto sul totale.
export default function DoveFinisce({ campi }: { campi: CampiForm }) {
  const retribuzione = campi.tipo === "COSTO_FISSO" && campi.eRetribuzione;
  const settimana = dataValida(campi.data) ? intervalloDi("settimana", campi.data) : null;
  const doc = NOME_DOCUMENTO[documentoDi(campi)];
  const categoria = categoriaDi(campi);
  const ripetizione = testoRipetizione(campi);
  const sedi = useSedi();
  const filtroSedi = sediDelMovimento(
    campi,
    sedi.locale.map((s) => s.id),
    sedi.attive.map((s) => s.id),
    sedi.piu,
  );
  const nDivise = sediDelleDivisione(
    campi,
    sedi.locale.map((s) => s.id),
    sedi.attive.map((s) => s.id),
  ).length;
  // «Tutte» sono le sedi del locale (`sediDivise` vuoto): le personali non entrano mai da sole in «Tutte, dividi».
  const nomeSede = campi.dividi ? (campi.sediDivise.length === 0 ? `Tutte, divise (${nDivise})` : `Divise fra ${nDivise} sedi`) : (sedi.attive.find((s) => s.id === campi.sedeId)?.nome ?? "Da scegliere");

  return (
    <div className="hidden w-[320px] shrink-0 flex-col gap-4 self-start lg:flex">
      <SchedaLaterale titolo="Dove finisce" etichetta="Dove finisce">
        <Riga nome="Voce" primo>
          <b>{VOCE_TIPO[campi.tipo]}</b>
        </Riga>
        {sedi.piu && (
          <Riga nome="Sede">
            <b>{nomeSede}</b>
          </Riga>
        )}
        {!retribuzione && (
          <Riga nome="Periodo">
            <b>{settimana ? settimanaBreve(settimana) : "–"}</b>
          </Riga>
        )}
        {categoria && (
          <Riga nome="Categoria">
            <b>{categoria}</b>
          </Riga>
        )}
        {doc && (
          <Riga nome="Tipo">
            <b>{doc}</b>
          </Riga>
        )}
        {retribuzione && (
          <Riga nome="Dipendente">
            <b>{campi.dipendente.trim() || "Non indicato"}</b>
          </Riga>
        )}
        {ripetizione && (
          <Riga nome="Ricorrenza">
            <b>{ripetizione}</b>
          </Riga>
        )}
      </SchedaLaterale>
      {retribuzione ? <CostoDelMese campi={campi} sedi={filtroSedi} /> : <TotaleSettimana campi={campi} sedi={filtroSedi} />}
    </div>
  );
}
