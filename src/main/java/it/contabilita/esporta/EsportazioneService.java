package it.contabilita.esporta;

import it.contabilita.api.Dto.Riepilogo;
import it.contabilita.api.Dto.RisultatoSede;
import it.contabilita.api.Dto.VoceFissa;
import it.contabilita.api.ErroreApi;
import it.contabilita.dati.Documento;
import it.contabilita.dati.Movimento;
import it.contabilita.dati.MovimentoRepository;
import it.contabilita.dati.Origine;
import it.contabilita.dati.Tipo;
import it.contabilita.movimenti.RiepilogoService;
import it.contabilita.movimenti.StatisticheService;
import it.contabilita.movimenti.StatisticheService.RigaStatistica;
import org.dhatim.fastexcel.Workbook;
import org.dhatim.fastexcel.Worksheet;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.function.ToLongFunction;

/**
 * {@code GET /api/esporta} (docs/api.md, "Esportazione (fase 3)"): i movimenti di un periodo in XLSX
 * (fogli Movimenti e Riepilogo) o CSV, scritti direttamente sull'{@link OutputStream} della risposta.
 * Parametri e dati si validano e si leggono PRIMA di avviare lo streaming ({@link #prepara}): un
 * parametro non valido risponde 400 con il corpo JSON di sempre, non un file a meta'.
 */
@Service
public class EsportazioneService {

    /** Il file pronto da scaricare. */
    public record Esportazione(String nomeFile, MediaType tipoContenuto, StreamingResponseBody corpo) {
    }

    /** Una riga gia' in forma di file: testi in italiano, importo con segno in centesimi. */
    record Riga(LocalDate data, String tipo, String documento, String categoria, String fornitore, String dipendente,
                String descrizione, String numeroDocumento, String note, long importoCentConSegno, String origine,
                String sede) {
    }

    static final String[] INTESTAZIONI = {"Data", "Tipo", "Documento", "Categoria", "Fornitore", "Dipendente",
            "Descrizione", "N. documento", "Note", "Importo", "Origine", "Sede"};
    private static final int COLONNA_DATA = 0;
    private static final int COLONNA_IMPORTO = 9;
    private static final int[] LARGHEZZE = {12, 16, 22, 20, 28, 20, 36, 16, 36, 14, 12, 24};
    private static final String FORMATO_DATA = "yyyy-mm-dd";
    private static final String FORMATO_VALUTA = "#,##0.00 [$€-410]";

    private final MovimentoRepository movimenti;
    private final RiepilogoService riepilogoService;
    private final StatisticheService statisticheService;

    public EsportazioneService(MovimentoRepository movimenti, RiepilogoService riepilogoService,
                               StatisticheService statisticheService) {
        this.movimenti = movimenti;
        this.riepilogoService = riepilogoService;
        this.statisticheService = statisticheService;
    }

    @Transactional(readOnly = true)
    public Esportazione prepara(String formatoParametro, LocalDate da, LocalDate a, String includi, Set<Long> sediIds,
                                boolean statisticheNelFile, boolean colonnePerSede) {
        FormatoEsportazione formato = FormatoEsportazione.diParametro(formatoParametro);
        if (da == null || a == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Servono entrambe le date: da e a.");
        }
        if (da.isAfter(a)) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "La data iniziale non può essere dopo quella finale.");
        }
        Set<Tipo> tipi = tipiDa(includi);

        Specification<Movimento> spec = (root, query, cb) -> sediIds == null
                ? cb.and(cb.greaterThanOrEqualTo(root.get("data"), da), cb.lessThanOrEqualTo(root.get("data"), a),
                        root.get("tipo").in(tipi))
                : cb.and(cb.greaterThanOrEqualTo(root.get("data"), da), cb.lessThanOrEqualTo(root.get("data"), a),
                        root.get("tipo").in(tipi), root.get("sede").get("id").in(sediIds));
        List<Riga> righe = movimenti.findAll(spec, Sort.by("data", "id")).stream().map(EsportazioneService::riga).toList();
        String nomeFile = "contabilita-" + da + "_" + a + "." + formato.estensione();

        StreamingResponseBody corpo;
        if (formato == FormatoEsportazione.CSV) {
            corpo = out -> scriviCsv(righe, out);
        } else {
            Riepilogo riepilogo = riepilogoService.calcola(da, a, sediIds);
            // una colonna per sede: il Riepilogo di ciascuna sede col suo filtro (stesso calcolo di /api/riepilogo)
            List<String> nomiSedi = new ArrayList<>();
            List<Riepilogo> dellaSede = new ArrayList<>();
            if (colonnePerSede && riepilogo.perSede().size() > 1) {
                for (RisultatoSede rs : riepilogo.perSede()) {
                    nomiSedi.add(rs.sede().nome());
                    dellaSede.add(riepilogoService.calcola(da, a, Set.of(rs.sede().id())));
                }
            }
            List<RigaStatistica> statistiche = statisticheNelFile
                    ? statisticheService.righePerEsportazione(da, a, sediIds) : List.of();
            corpo = out -> scriviXlsx(righe, riepilogo, nomiSedi, dellaSede, statistiche, out);
        }
        return new Esportazione(nomeFile, formato.tipoContenuto(), corpo);
    }

    /** {@code includi}: elenco di {@link Tipo} separati da virgola; assente o vuoto = tutti. */
    private static Set<Tipo> tipiDa(String includi) {
        if (includi == null || includi.isBlank()) {
            return EnumSet.allOf(Tipo.class);
        }
        Set<Tipo> tipi = EnumSet.noneOf(Tipo.class);
        for (String voce : includi.split(",")) {
            try {
                tipi.add(Tipo.valueOf(voce.trim()));
            } catch (IllegalArgumentException e) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "includi: valore non valido: " + voce.trim());
            }
        }
        return tipi;
    }

    // ------------------------------------------------------------------ etichette

    private static Riga riga(Movimento m) {
        long importo = m.getTipo().isCosto() ? -m.getEffettoSuiCostiCent() : m.getImportoCent();
        return new Riga(m.getData(), etichetta(m.getTipo()), etichetta(m.getDocumento()),
                m.getCategoria() == null ? "" : m.getCategoria().getNome(),
                m.getFornitore() == null ? "" : m.getFornitore().getNome(),
                m.getDipendente() == null ? "" : m.getDipendente().getNome(),
                vuoto(m.getDescrizione()), vuoto(m.getNumeroDocumento()), vuoto(m.getNote()),
                importo, etichetta(m.getOrigine()), m.getSede().getNome());
    }

    private static String vuoto(String s) {
        return s == null ? "" : s;
    }

    static String etichetta(Tipo t) {
        return switch (t) {
            case RICAVO -> "Ricavo";
            case COSTO_VARIABILE -> "Costo variabile";
            case COSTO_FISSO -> "Costo fisso";
        };
    }

    static String etichetta(Documento d) {
        return switch (d) {
            case RICAVO_FATTURATO -> "Fatturato";
            case RICAVO_EXTRA -> "Extra";
            case FATTURA -> "Fattura";
            case NOTA_DI_CREDITO -> "Nota di credito";
            case SCONTRINO -> "Scontrino";
            case RETRIBUZIONE_REGOLARE -> "Retribuzione regolare";
            case RETRIBUZIONE_EXTRA -> "Retribuzione extra";
            case NESSUNO -> "-";
        };
    }

    static String etichetta(Origine o) {
        return switch (o) {
            case MANO -> "A mano";
            case XML -> "XML";
            case RICORRENZA -> "Ricorrenza";
        };
    }

    // ------------------------------------------------------------------ CSV

    /**
     * UTF-8 con BOM e separatore {@code ;} (quello che Excel italiano si aspetta con un doppio
     * clic), righe CRLF, date ISO, importi con virgola decimale e senza separatore delle migliaia.
     */
    void scriviCsv(List<Riga> righe, OutputStream out) throws IOException {
        out.write(0xEF);
        out.write(0xBB);
        out.write(0xBF);
        BufferedWriter scrittore = new BufferedWriter(new OutputStreamWriter(out, StandardCharsets.UTF_8));
        scriviRigaCsv(scrittore, INTESTAZIONI);
        String[] campi = new String[INTESTAZIONI.length];
        for (Riga r : righe) {
            campi[0] = r.data().toString();
            campi[1] = r.tipo();
            campi[2] = r.documento();
            campi[3] = r.categoria();
            campi[4] = r.fornitore();
            campi[5] = r.dipendente();
            campi[6] = r.descrizione();
            campi[7] = r.numeroDocumento();
            campi[8] = r.note();
            campi[9] = importoCsv(r.importoCentConSegno());
            campi[10] = r.origine();
            campi[11] = r.sede();
            scriviRigaCsv(scrittore, campi);
        }
        scrittore.flush(); // niente close(): chiuderebbe anche "out", che e' della risposta HTTP
    }

    private static void scriviRigaCsv(BufferedWriter scrittore, String[] campi) throws IOException {
        for (int i = 0; i < campi.length; i++) {
            if (i > 0) {
                scrittore.write(';');
            }
            scrittore.write(campoCsv(campi[i]));
        }
        scrittore.write("\r\n");
    }

    /** Tra virgolette solo se contiene {@code ;}, {@code "} o un a capo; le virgolette interne raddoppiano. */
    static String campoCsv(String campo) {
        if (campo == null || campo.isEmpty()) {
            return "";
        }
        boolean daVirgolettare = campo.indexOf(';') >= 0 || campo.indexOf('"') >= 0
                || campo.indexOf('\n') >= 0 || campo.indexOf('\r') >= 0;
        return daVirgolettare ? "\"" + campo.replace("\"", "\"\"") + "\"" : campo;
    }

    /** {@code -4550} diventa {@code -45,50}. */
    static String importoCsv(long centesimi) {
        long assoluto = Math.abs(centesimi);
        return (centesimi < 0 ? "-" : "") + (assoluto / 100) + "," + String.format("%02d", assoluto % 100);
    }

    // ------------------------------------------------------------------ XLSX

    /**
     * Foglio «Movimenti»: data come cella data, importo come numero in euro con formato valuta,
     * intestazione in grassetto e bloccata. Foglio «Riepilogo»: le voci di {@code /api/riepilogo}.
     * Le stringhe si scrivono con {@code inlineString} (niente tabella delle stringhe condivise in
     * memoria: coerente con lo streaming).
     */
    void scriviXlsx(List<Riga> righe, Riepilogo riepilogo, List<String> nomiSedi, List<Riepilogo> dellaSede,
                    List<RigaStatistica> statistiche, OutputStream out) throws IOException {
        try (Workbook cartella = new Workbook(out, "Contabilita", "1.0")) {
            Worksheet foglio = cartella.newWorksheet("Movimenti");
            for (int c = 0; c < INTESTAZIONI.length; c++) {
                foglio.inlineString(0, c, INTESTAZIONI[c]);
                foglio.width(c, LARGHEZZE[c]);
            }
            foglio.range(0, 0, 0, INTESTAZIONI.length - 1).style().bold().fillColor("D9D9D9").set();
            foglio.freezePane(0, 1);

            int riga = 1;
            for (Riga r : righe) {
                foglio.value(riga, COLONNA_DATA, r.data());
                foglio.style(riga, COLONNA_DATA).format(FORMATO_DATA).horizontalAlignment("left").set();
                foglio.inlineString(riga, 1, r.tipo());
                foglio.inlineString(riga, 2, r.documento());
                foglio.inlineString(riga, 3, r.categoria());
                foglio.inlineString(riga, 4, r.fornitore());
                foglio.inlineString(riga, 5, r.dipendente());
                foglio.inlineString(riga, 6, r.descrizione());
                foglio.inlineString(riga, 7, r.numeroDocumento());
                foglio.inlineString(riga, 8, r.note());
                foglio.value(riga, COLONNA_IMPORTO, r.importoCentConSegno() / 100.0);
                foglio.style(riga, COLONNA_IMPORTO).format(FORMATO_VALUTA).set();
                foglio.inlineString(riga, 10, r.origine());
                foglio.inlineString(riga, 11, r.sede());
                riga++;
            }
            scriviRiepilogo(cartella.newWorksheet("Riepilogo"), riepilogo, nomiSedi, dellaSede);
            if (!statistiche.isEmpty()) { // il foglio c'e' solo se nel periodo qualcuno ha caricato pizze e ordini
                scriviStatistiche(cartella.newWorksheet("Statistiche"), statistiche);
            }
        }
    }

    private static final String[] INTESTAZIONI_STATISTICHE = {"Settimana", "Sede", "Pizze", "Ordini", "Ricavi", "Scontrino medio"};

    /** Una riga per sede e settimana (il lunedi'); lo scontrino medio e' vuoto se gli ordini sono 0. */
    private void scriviStatistiche(Worksheet f, List<RigaStatistica> righe) {
        int[] larghezze = {12, 24, 10, 10, 14, 16};
        for (int c = 0; c < INTESTAZIONI_STATISTICHE.length; c++) {
            f.inlineString(0, c, INTESTAZIONI_STATISTICHE[c]);
            f.width(c, larghezze[c]);
        }
        f.range(0, 0, 0, INTESTAZIONI_STATISTICHE.length - 1).style().bold().fillColor("D9D9D9").set();
        f.freezePane(0, 1);
        int riga = 1;
        for (RigaStatistica r : righe) {
            f.value(riga, 0, r.settimana());
            f.style(riga, 0).format(FORMATO_DATA).horizontalAlignment("left").set();
            f.inlineString(riga, 1, r.sede());
            f.value(riga, 2, r.pizze());
            f.value(riga, 3, r.ordini());
            f.value(riga, 4, r.ricaviCent() / 100.0);
            f.style(riga, 4).format(FORMATO_VALUTA).set();
            if (r.scontrinoMedioCent() != null) {
                f.value(riga, 5, r.scontrinoMedioCent() / 100.0);
                f.style(riga, 5).format(FORMATO_VALUTA).set();
            }
            riga++;
        }
    }

    /** Una riga del foglio Riepilogo: come si legge il suo importo da un {@link Riepilogo}. */
    private record Voce(String nome, boolean totale, ToLongFunction<Riepilogo> importo) {
    }

    private static long altra(List<VoceFissa> voci, String nome) {
        return voci.stream().filter(v -> v.categoria().equals(nome)).mapToLong(VoceFissa::importoCent).sum();
    }

    /** Le righe del foglio, dal Riepilogo complessivo (le categorie personalizzate di tutte le sedi sono li'). */
    private static List<Voce> voci(Riepilogo r) {
        List<Voce> v = new ArrayList<>();
        v.add(new Voce("Ricavi fatturati", false, x -> x.ricavi().fatturatiCent()));
        v.add(new Voce("Ricavi extra", false, x -> x.ricavi().extraCent()));
        for (VoceFissa f : r.ricavi().altreVoci()) {
            v.add(new Voce(f.categoria(), false, x -> altra(x.ricavi().altreVoci(), f.categoria())));
        }
        v.add(new Voce("Totale ricavi", true, x -> x.ricavi().totaleCent()));
        v.add(new Voce("Fatture", false, x -> x.costiVariabili().fattureCent()));
        v.add(new Voce("Scontrini", false, x -> x.costiVariabili().scontriniCent()));
        for (VoceFissa f : r.costiVariabili().altreVoci()) {
            v.add(new Voce(f.categoria(), false, x -> altra(x.costiVariabili().altreVoci(), f.categoria())));
        }
        v.add(new Voce("Totale costi variabili", true, x -> x.costiVariabili().totaleCent()));
        v.add(new Voce("Retribuzione regolare", false, x -> x.costiFissi().retribuzioneRegolareCent()));
        v.add(new Voce("Retribuzione extra", false, x -> x.costiFissi().retribuzioneExtraCent()));
        for (VoceFissa f : r.costiFissi().altreVoci()) {
            v.add(new Voce(f.categoria(), false, x -> altra(x.costiFissi().altreVoci(), f.categoria())));
        }
        v.add(new Voce("Totale costi fissi", true, x -> x.costiFissi().totaleCent()));
        v.add(new Voce("Costi", true, Riepilogo::costiCent));
        v.add(new Voce("Risultato", true, Riepilogo::risultatoCent));
        return v;
    }

    /**
     * Colonne: Voce, poi «Importo» oppure (con {@code nomiSedi}) una per sede e «Totale». Le righe sono quelle del
     * Riepilogo complessivo; dove una sede non ha la categoria l'importo e' 0.
     */
    private void scriviRiepilogo(Worksheet f, Riepilogo r, List<String> nomiSedi, List<Riepilogo> dellaSede) {
        List<String> intestazioni = new ArrayList<>(nomiSedi);
        intestazioni.add(nomiSedi.isEmpty() ? "Importo" : "Totale");
        List<Riepilogo> colonne = new ArrayList<>(dellaSede);
        colonne.add(r);

        f.width(0, 34);
        f.inlineString(0, 0, "Riepilogo dal " + r.da() + " al " + r.a());
        f.style(0, 0).bold().fontSize(12).set();
        f.inlineString(2, 0, "Voce");
        for (int c = 0; c < intestazioni.size(); c++) {
            f.width(c + 1, 16);
            f.inlineString(2, c + 1, intestazioni.get(c));
        }
        f.range(2, 0, 2, intestazioni.size()).style().bold().fillColor("D9D9D9").set();

        int riga = 3;
        for (Voce v : voci(r)) {
            f.inlineString(riga, 0, v.nome());
            if (v.totale()) {
                f.style(riga, 0).bold().set();
            }
            for (int c = 0; c < colonne.size(); c++) {
                f.value(riga, c + 1, v.importo().applyAsLong(colonne.get(c)) / 100.0);
                if (v.totale()) {
                    f.style(riga, c + 1).format(FORMATO_VALUTA).bold().set();
                } else {
                    f.style(riga, c + 1).format(FORMATO_VALUTA).set();
                }
            }
            riga++;
        }
    }
}
