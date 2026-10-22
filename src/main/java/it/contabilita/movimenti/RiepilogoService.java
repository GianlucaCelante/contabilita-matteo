package it.contabilita.movimenti;

import it.contabilita.api.Dto.CostiFissi;
import it.contabilita.api.Dto.CostiVariabili;
import it.contabilita.api.Dto.Ricavi;
import it.contabilita.api.Dto.Riepilogo;
import it.contabilita.api.Dto.VoceFissa;
import it.contabilita.api.ErroreApi;
import it.contabilita.dati.Documento;
import it.contabilita.dati.Movimento;
import it.contabilita.dati.MovimentoRepository;
import it.contabilita.dati.Tipo;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Riepilogo di un periodo: ricavi, costi variabili, costi fissi e risultato (docs/api.md). */
@Service
public class RiepilogoService {

    static final String VOCE_SENZA_CATEGORIA = "Altre voci fisse";

    private final MovimentoRepository movimenti;

    public RiepilogoService(MovimentoRepository movimenti) {
        this.movimenti = movimenti;
    }

    @Transactional(readOnly = true)
    public Riepilogo calcola(LocalDate da, LocalDate a) {
        if (da == null || a == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Servono entrambe le date: da e a.");
        }
        if (da.isAfter(a)) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "La data iniziale non può essere dopo quella finale.");
        }
        Specification<Movimento> spec = (root, query, cb) -> cb.and(
                cb.greaterThanOrEqualTo(root.get("data"), da),
                cb.lessThanOrEqualTo(root.get("data"), a));
        List<Movimento> righe = movimenti.findAll(spec, Sort.by("id"));

        long fatturati = 0, extra = 0, fatture = 0, scontrini = 0, retribuzioneRegolare = 0, retribuzioneExtra = 0;
        Map<String, Long> altre = new TreeMap<>();
        for (Movimento m : righe) {
            long importo = m.getImportoCent();
            Documento d = m.getDocumento();
            switch (d) {
                case RICAVO_FATTURATO -> fatturati += importo;
                case RICAVO_EXTRA -> extra += importo;
                case FATTURA -> fatture += importo;
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
        List<VoceFissa> voci = altre.entrySet().stream()
                .map(e -> new VoceFissa(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingLong(VoceFissa::importoCent).reversed().thenComparing(VoceFissa::categoria))
                .toList();
        long altreTotale = voci.stream().mapToLong(VoceFissa::importoCent).sum();

        long ricaviTotale = fatturati + extra;
        long variabiliTotale = fatture + scontrini;
        long fissiTotale = retribuzioneRegolare + retribuzioneExtra + altreTotale;
        long costi = variabiliTotale + fissiTotale;
        return new Riepilogo(da, a,
                new Ricavi(fatturati, extra, ricaviTotale),
                new CostiVariabili(fatture, scontrini, variabiliTotale),
                new CostiFissi(retribuzioneRegolare, retribuzioneExtra, voci, fissiTotale),
                costi, ricaviTotale - costi);
    }
}
