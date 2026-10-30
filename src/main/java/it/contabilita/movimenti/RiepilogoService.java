package it.contabilita.movimenti;

import it.contabilita.api.Dto.CostiFissi;
import it.contabilita.api.Dto.CostiVariabili;
import it.contabilita.api.Dto.Ricavi;
import it.contabilita.api.Dto.Rif;
import it.contabilita.api.Dto.Riepilogo;
import it.contabilita.api.Dto.RisultatoSede;
import it.contabilita.api.Dto.VoceFissa;
import it.contabilita.api.ErroreApi;
import it.contabilita.dati.Documento;
import it.contabilita.dati.Movimento;
import it.contabilita.dati.MovimentoRepository;
import it.contabilita.dati.Sede;
import it.contabilita.dati.Tipo;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/** Riepilogo di un periodo: ricavi, costi variabili, costi fissi e risultato (docs/api.md). */
@Service
public class RiepilogoService {

    static final String VOCE_SENZA_CATEGORIA = "Altre voci fisse";

    private final MovimentoRepository movimenti;
    private final SediService sedi;

    public RiepilogoService(MovimentoRepository movimenti, SediService sedi) {
        this.movimenti = movimenti;
        this.sedi = sedi;
    }

    /** Tutte le sedi. */
    public Riepilogo calcola(LocalDate da, LocalDate a) {
        return calcola(da, a, null);
    }

    /** {@code sediIds}: le sedi da includere; null = tutte (archiviate comprese). */
    @Transactional(readOnly = true)
    public Riepilogo calcola(LocalDate da, LocalDate a, Set<Long> sediIds) {
        if (da == null || a == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Servono entrambe le date: da e a.");
        }
        if (da.isAfter(a)) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "La data iniziale non può essere dopo quella finale.");
        }
        Specification<Movimento> spec = (root, query, cb) -> sediIds == null
                ? cb.and(cb.greaterThanOrEqualTo(root.get("data"), da), cb.lessThanOrEqualTo(root.get("data"), a))
                : cb.and(cb.greaterThanOrEqualTo(root.get("data"), da), cb.lessThanOrEqualTo(root.get("data"), a),
                        root.get("sede").get("id").in(sediIds));
        List<Movimento> righe = movimenti.findAll(spec, Sort.by("id"));

        long fatturati = 0, extra = 0, fatture = 0, scontrini = 0, retribuzioneRegolare = 0, retribuzioneExtra = 0;
        Map<String, Long> altre = new TreeMap<>();
        Map<String, Long> ricaviPerCategoria = new TreeMap<>();
        Map<String, Long> variabiliPerCategoria = new TreeMap<>();
        for (Movimento m : righe) {
            long importo = m.getImportoCent();
            Documento d = m.getDocumento();
            // Ricavi e costi variabili di una categoria personalizzata hanno la riga della categoria, non quelle base.
            if (m.getCategoria() != null && m.getCategoria().isPersonalizzata()) {
                if (m.getTipo() == Tipo.RICAVO) {
                    ricaviPerCategoria.merge(m.getCategoria().getNome(), importo, Long::sum);
                    continue;
                }
                if (m.getTipo() == Tipo.COSTO_VARIABILE) {
                    variabiliPerCategoria.merge(m.getCategoria().getNome(), d == Documento.NOTA_DI_CREDITO ? -importo : importo, Long::sum);
                    continue;
                }
            }
            switch (d) {
                case RICAVO_FATTURATO -> fatturati += importo;
                case RICAVO_EXTRA -> extra += importo;
                case FATTURA -> fatture += importo;
                case NOTA_DI_CREDITO -> fatture -= importo; // riduce le fatture
                case SCONTRINO -> scontrini += importo;
                case RETRIBUZIONE_REGOLARE -> retribuzioneRegolare += importo;
                case RETRIBUZIONE_EXTRA -> retribuzioneExtra += importo;
                case NESSUNO -> {
                    if (m.getTipo() == Tipo.COSTO_FISSO) {
                        String nome = m.getCategoria() == null ? VOCE_SENZA_CATEGORIA : m.getCategoria().getNome();
                        altre.merge(nome, importo, Long::sum);
                    }
                }
            }
        }
        List<VoceFissa> voci = ordinate(altre);
        long altreTotale = voci.stream().mapToLong(VoceFissa::importoCent).sum();
        List<VoceFissa> vociRicavi = ordinate(ricaviPerCategoria);
        List<VoceFissa> vociVariabili = ordinate(variabiliPerCategoria);

        long ricaviTotale = fatturati + extra + vociRicavi.stream().mapToLong(VoceFissa::importoCent).sum();
        long variabiliTotale = fatture + scontrini + vociVariabili.stream().mapToLong(VoceFissa::importoCent).sum();
        long fissiTotale = retribuzioneRegolare + retribuzioneExtra + altreTotale;
        long costi = variabiliTotale + fissiTotale;
        return new Riepilogo(da, a,
                new Ricavi(fatturati, extra, vociRicavi, ricaviTotale),
                new CostiVariabili(fatture, scontrini, vociVariabili, variabiliTotale),
                new CostiFissi(retribuzioneRegolare, retribuzioneExtra, voci, fissiTotale),
                costi, ricaviTotale - costi, perSede(righe, sediIds));
    }

    /** Importo decrescente, poi nome. */
    private static List<VoceFissa> ordinate(Map<String, Long> perCategoria) {
        return perCategoria.entrySet().stream()
                .map(e -> new VoceFissa(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingLong(VoceFissa::importoCent).reversed().thenComparing(VoceFissa::categoria))
                .toList();
    }

    /**
     * Ricavi, costi e risultato di ogni sede selezionata, nell'ordine degli elenchi. Una sede senza movimenti nel
     * periodo compare a zero se non e' archiviata; una archiviata solo se ha movimenti nel periodo.
     */
    private List<RisultatoSede> perSede(List<Movimento> righe, Set<Long> sediIds) {
        Map<Long, long[]> somme = new HashMap<>(); // [ricavi, costi]
        for (Movimento m : righe) {
            long[] v = somme.computeIfAbsent(m.getSede().getId(), k -> new long[2]);
            if (m.getTipo().isCosto()) {
                v[1] += m.getEffettoSuiCostiCent();
            } else {
                v[0] += m.getImportoCent();
            }
        }
        List<RisultatoSede> risultato = new ArrayList<>();
        for (Sede s : sedi.tutte()) {
            if (sediIds != null && !sediIds.contains(s.getId())) {
                continue;
            }
            long[] v = somme.get(s.getId());
            if (v == null && s.isArchiviata()) {
                continue;
            }
            long ricavi = v == null ? 0 : v[0];
            long costi = v == null ? 0 : v[1];
            risultato.add(new RisultatoSede(new Rif(s.getId(), s.getNome()), ricavi, costi, ricavi - costi));
        }
        return risultato;
    }
}
