package it.contabilita.movimenti;

import it.contabilita.api.ErroreApi;
import it.contabilita.dati.Documento;
import it.contabilita.dati.Movimento;
import it.contabilita.dati.MovimentoRepository;
import it.contabilita.dati.Tipo;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Statistiche per voce (docs/api.md, «Statistiche per voce»): per fornitore, dipendente o categoria, i totali di un
 * periodo con il dettaglio per mese. Le note di credito riducono l'importo; i movimenti senza la voce stanno in una
 * riga {@code id: null} in fondo.
 */
@Service
public class StatisticheVociService {

    public record VoceStatistica(Long id, String nome, long totaleCent, int movimenti, long regolareCent, long extraCent,
                                 Long pagataCent, Long fattureCent, List<Long> perMese, List<Integer> movimentiPerMese,
                                 List<Long> pagataPerMese, List<Long> fatturePerMese) {
    }

    public record StatisticheVoci(LocalDate da, LocalDate a, Voce raggruppa, String tipo, List<String> mesi,
                                  long totaleCent, int movimenti, List<VoceStatistica> voci) {
    }

    /** Il valore «COSTI» di {@code tipo}: costi variabili + costi fissi. */
    static final String COSTI = "COSTI";

    private final MovimentoRepository movimenti;

    public StatisticheVociService(MovimentoRepository movimenti) {
        this.movimenti = movimenti;
    }

    private static final class Riga {
        final String nome;
        long totale;
        int conta;
        long regolare;
        long extra;
        long pagata;
        long fatture;
        final long[] perMese;
        final int[] movimentiPerMese;
        final long[] pagataPerMese;
        final long[] fatturePerMese;
        /** Le divisioni gia' contate, per mese: le parti di un movimento diviso fra sedi valgono un movimento solo. */
        final Set<String> divisioniContate = new HashSet<>();

        Riga(String nome, int mesi) {
            this.nome = nome;
            this.perMese = new long[mesi];
            this.movimentiPerMese = new int[mesi];
            this.pagataPerMese = new long[mesi];
            this.fatturePerMese = new long[mesi];
        }
    }

    @Transactional(readOnly = true)
    public StatisticheVoci calcola(LocalDate da, LocalDate a, String raggruppa, String tipoParametro, Set<Long> sediIds) {
        if (da == null || a == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Servono entrambe le date: da e a.");
        }
        if (da.isAfter(a)) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "La data iniziale non può essere dopo quella finale.");
        }
        if (raggruppa == null || raggruppa.isBlank()) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Serve raggruppa: FORNITORE, DIPENDENTE o CATEGORIA.");
        }
        Voce voce;
        try {
            voce = Voce.valueOf(raggruppa.trim());
        } catch (IllegalArgumentException e) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "raggruppa: valore non valido: " + raggruppa + " (FORNITORE, DIPENDENTE o CATEGORIA).");
        }
        String tipo = tipoParametro == null || tipoParametro.isBlank() ? null : tipoParametro.trim();
        if (tipo != null && !tipo.equals(COSTI)) {
            try {
                Tipo.valueOf(tipo);
            } catch (IllegalArgumentException e) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "tipo: valore non valido: " + tipoParametro);
            }
        }
        // dipendente: solo le retribuzioni, tipo non si usa; fornitore: di default i costi variabili; categoria: tutti
        String tipoEffettivo = switch (voce) {
            case DIPENDENTE -> null;
            case FORNITORE -> tipo == null ? Tipo.COSTO_VARIABILE.name() : tipo;
            case CATEGORIA -> tipo;
        };

        List<YearMonth> mesi = new ArrayList<>();
        for (YearMonth m = YearMonth.from(da); !m.isAfter(YearMonth.from(a)); m = m.plusMonths(1)) {
            mesi.add(m);
        }
        Specification<Movimento> spec = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.greaterThanOrEqualTo(root.get("data"), da));
            p.add(cb.lessThanOrEqualTo(root.get("data"), a));
            if (sediIds != null) {
                p.add(root.get("sede").get("id").in(sediIds));
            }
            if (voce == Voce.DIPENDENTE) {
                p.add(root.get("documento").in(Documento.RETRIBUZIONE_REGOLARE, Documento.RETRIBUZIONE_EXTRA));
            } else if (tipoEffettivo != null) {
                if (tipoEffettivo.equals(COSTI)) {
                    p.add(root.get("tipo").in(Tipo.COSTO_VARIABILE, Tipo.COSTO_FISSO));
                } else {
                    p.add(cb.equal(root.get("tipo"), Tipo.valueOf(tipoEffettivo)));
                }
            }
            return cb.and(p.toArray(new Predicate[0]));
        };
        List<Movimento> righe = movimenti.findAll(spec, Sort.by("id"));

        Map<Long, Riga> perVoce = new HashMap<>();
        long totale = 0;
        int contati = 0;
        for (Movimento m : righe) {
            Long id;
            String nome;
            switch (voce) {
                case FORNITORE -> {
                    id = m.getFornitore() == null ? null : m.getFornitore().getId();
                    nome = m.getFornitore() == null ? null : m.getFornitore().getNome();
                }
                case DIPENDENTE -> {
                    id = m.getDipendente() == null ? null : m.getDipendente().getId();
                    nome = m.getDipendente() == null ? null : m.getDipendente().getNome();
                }
                default -> {
                    id = m.getCategoria() == null ? null : m.getCategoria().getId();
                    nome = m.getCategoria() == null ? null : m.getCategoria().getNome();
                }
            }
            Riga r = perVoce.computeIfAbsent(id, k -> new Riga(nome, mesi.size()));
            long effetto = m.getEffettoSuiCostiCent();
            r.totale += effetto;
            int mese = (int) java.time.temporal.ChronoUnit.MONTHS.between(mesi.get(0), YearMonth.from(m.getData()));
            r.perMese[mese] += effetto;
            // I conteggi: le parti di una divisione (stesso id comune) nella stessa voce e nello stesso mese contano una
            // volta, anche se il filtro delle sedi ne prende solo alcune. Gli importi restano la somma delle parti.
            if (m.getDivisione() == null || r.divisioniContate.add(mese + "\n" + m.getDivisione())) {
                r.conta++;
                r.movimentiPerMese[mese]++;
                contati++;
            }
            if (voce == Voce.DIPENDENTE) {
                if (m.getDocumento() == Documento.RETRIBUZIONE_REGOLARE) {
                    r.regolare += m.getImportoCent();
                } else if (m.getDocumento() == Documento.RETRIBUZIONE_EXTRA) {
                    r.extra += m.getImportoCent();
                }
            }
            // Il «da pagare» riguarda solo le fatture (meno le note di credito): gli scontrini sono gia' pagati alla cassa.
            if (m.getDocumento() == Documento.FATTURA || m.getDocumento() == Documento.NOTA_DI_CREDITO) {
                r.fatture += effetto;
                r.fatturePerMese[mese] += effetto;
            }
            if (m.getDocumento() == Documento.FATTURA && m.isPagata()) {
                r.pagata += m.getImportoCent();
                r.pagataPerMese[mese] += m.getImportoCent();
            }
            totale += effetto;
        }

        List<VoceStatistica> voci = new ArrayList<>();
        perVoce.entrySet().stream()
                .filter(e -> e.getKey() != null)
                .sorted(Comparator.<Map.Entry<Long, Riga>>comparingLong(e -> e.getValue().totale).reversed()
                        .thenComparing(e -> e.getValue().nome, String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(Map.Entry::getKey))
                .forEach(e -> voci.add(voce(voce, e.getKey(), e.getValue().nome, e.getValue())));
        Riga senza = perVoce.get(null);
        if (senza != null) {
            voci.add(voce(voce, null, voce.etichettaSenza, senza));
        }
        return new StatisticheVoci(da, a, voce, tipoEffettivo, mesi.stream().map(YearMonth::toString).toList(),
                totale, contati, voci);
    }

    private static VoceStatistica voce(Voce raggruppa, Long id, String nome, Riga r) {
        boolean fornitore = raggruppa == Voce.FORNITORE;
        return new VoceStatistica(id, nome, r.totale, r.conta, r.regolare, r.extra,
                fornitore ? r.pagata : null,
                fornitore ? r.fatture : null,
                lista(r.perMese),
                java.util.Arrays.stream(r.movimentiPerMese).boxed().toList(),
                fornitore ? lista(r.pagataPerMese) : null,
                fornitore ? lista(r.fatturePerMese) : null);
    }

    private static List<Long> lista(long[] valori) {
        return java.util.Arrays.stream(valori).boxed().toList();
    }
}
