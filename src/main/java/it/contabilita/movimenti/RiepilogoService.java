package it.contabilita.movimenti;

import it.contabilita.api.Dto.CostiFissi;
import it.contabilita.api.Dto.CostiVariabili;
import it.contabilita.api.Dto.Ricavi;
import it.contabilita.api.Dto.Rif;
import it.contabilita.api.Dto.Riepilogo;
import it.contabilita.api.Dto.RisultatoSede;
import it.contabilita.api.Dto.VoceCategoria;
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

/** Riepilogo di un periodo: ricavi, costi variabili, costi fissi e risultato (docs/api.md). */
@Service
public class RiepilogoService {

    public static final String VOCE_SENZA_CATEGORIA = "Senza categoria";

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

        // Le somme per documento sono «di cui» (tutti i movimenti del tipo con quel documento, qualunque categoria);
        // le voci sono una riga per categoria, «Senza categoria» (id null) in fondo.
        long fatturati = 0, extra = 0, fatture = 0, scontrini = 0, retribuzioneRegolare = 0, retribuzioneExtra = 0;
        Map<Long, Riga> ricaviPerCategoria = new HashMap<>();
        Map<Long, Riga> variabiliPerCategoria = new HashMap<>();
        Map<Long, Riga> fissiPerCategoria = new HashMap<>();
        for (Movimento m : righe) {
            long importo = m.getImportoCent();
            long effetto = m.getDocumento() == Documento.NOTA_DI_CREDITO ? -importo : importo; // la nota riduce
            switch (m.getDocumento()) {
                case RICAVO_FATTURATO -> fatturati += importo;
                case RICAVO_EXTRA -> extra += importo;
                case FATTURA -> fatture += importo;
                case NOTA_DI_CREDITO -> fatture -= importo;
                case SCONTRINO -> scontrini += importo;
                case RETRIBUZIONE_REGOLARE -> retribuzioneRegolare += importo;
                case RETRIBUZIONE_EXTRA -> retribuzioneExtra += importo;
                case NESSUNO -> { }
            }
            Map<Long, Riga> sezione = switch (m.getTipo()) {
                case RICAVO -> ricaviPerCategoria;
                case COSTO_VARIABILE -> variabiliPerCategoria;
                case COSTO_FISSO -> fissiPerCategoria;
            };
            Long id = m.getCategoria() == null ? null : m.getCategoria().getId();
            String nome = m.getCategoria() == null ? null : m.getCategoria().getNome();
            sezione.computeIfAbsent(id, k -> new Riga(nome)).importo += effetto;
        }
        List<VoceCategoria> vociRicavi = ordinate(ricaviPerCategoria);
        List<VoceCategoria> vociVariabili = ordinate(variabiliPerCategoria);
        List<VoceCategoria> vociFisse = ordinate(fissiPerCategoria);

        long ricaviTotale = somma(vociRicavi);
        long variabiliTotale = somma(vociVariabili);
        long fissiTotale = somma(vociFisse);
        long costi = variabiliTotale + fissiTotale;
        return new Riepilogo(da, a,
                new Ricavi(vociRicavi, fatturati, extra, ricaviTotale),
                new CostiVariabili(vociVariabili, fatture, scontrini, variabiliTotale),
                new CostiFissi(vociFisse, retribuzioneRegolare, retribuzioneExtra, fissiTotale),
                costi, ricaviTotale - costi, perSede(righe, sediIds));
    }

    private static final class Riga {
        final String nome;
        long importo;

        Riga(String nome) {
            this.nome = nome;
        }
    }

    private static long somma(List<VoceCategoria> voci) {
        return voci.stream().mapToLong(VoceCategoria::importoCent).sum();
    }

    /** Importo decrescente, poi nome; «Senza categoria» (id null) sempre in fondo. */
    private static List<VoceCategoria> ordinate(Map<Long, Riga> perCategoria) {
        List<VoceCategoria> con = perCategoria.entrySet().stream()
                .filter(e -> e.getKey() != null)
                .map(e -> new VoceCategoria(e.getKey(), e.getValue().nome, e.getValue().importo))
                .sorted(Comparator.comparingLong(VoceCategoria::importoCent).reversed()
                        .thenComparing(VoceCategoria::categoria, String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(VoceCategoria::id))
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        Riga senza = perCategoria.get(null);
        if (senza != null) {
            con.add(new VoceCategoria(null, VOCE_SENZA_CATEGORIA, senza.importo));
        }
        return con;
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
