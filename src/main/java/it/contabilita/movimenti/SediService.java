package it.contabilita.movimenti;

import it.contabilita.api.Dto.SedeDto;
import it.contabilita.api.Dto.SedeInput;
import it.contabilita.api.ErroreApi;
import it.contabilita.dati.MovimentoRepository;
import it.contabilita.dati.Sede;
import it.contabilita.dati.SedeRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Le sedi della pizzeria: elenco, creazione dal nome (senza distinguere maiuscole), rinomina, archiviazione.
 * Una sede non si cancella; l'ultima sede attiva non si puo' archiviare. Una sede «personale» (spese dei titolari) non ha
 * pizze e ordini e resta fuori dai totali se il filtro sedi manca; il locale ha sempre almeno una sede attiva non personale.
 */
@Service
public class SediService {

    private final SedeRepository sedi;
    private final MovimentoRepository movimenti;
    private final Clock clock;

    public SediService(SedeRepository sedi, MovimentoRepository movimenti, Clock clock) {
        this.sedi = sedi;
        this.movimenti = movimenti;
        this.clock = clock;
    }

    // ---- elenco ----

    /** Le non archiviate per prime, per ordine; con il numero di movimenti di ciascuna. */
    @Transactional(readOnly = true)
    public List<SedeDto> elenco() {
        Map<Long, Long> usi = conteggi();
        return sedi.findAllByOrderByArchiviataAscOrdineAscIdAsc().stream()
                .map(s -> dto(s, usi.getOrDefault(s.getId(), 0L))).toList();
    }

    private Map<Long, Long> conteggi() {
        Map<Long, Long> usi = new HashMap<>();
        for (Object[] riga : movimenti.contaPerSede()) {
            usi.put((Long) riga[0], (Long) riga[1]);
        }
        return usi;
    }

    /** Le sedi attive nell'ordine in cui si assegnano i centesimi di resto di una divisione. */
    @Transactional(readOnly = true)
    public List<Sede> attive() {
        return sedi.findByArchiviataFalseOrderByOrdineAscIdAsc();
    }

    /** Tutte le sedi, archiviate comprese, nell'ordine degli elenchi. */
    @Transactional(readOnly = true)
    public List<Sede> tutte() {
        return sedi.findAllByOrderByArchiviataAscOrdineAscIdAsc();
    }

    // ---- creazione e modifica ----

    /** La sede e se e' stata creata adesso (201) o esisteva gia' (200). */
    public record Esito(SedeDto sede, boolean creata) {
    }

    /** {@code personale} vale solo per una sede nuova (null = no); una sede che esiste gia' torna com'e'. */
    @Transactional
    public Esito crea(String nome, Boolean personale) {
        String n = nomeObbligatorio(nome);
        return sedi.findByNomeChiave(AnagraficheService.chiave(n))
                .map(s -> new Esito(dto(s), false))
                .orElseGet(() -> {
                    Sede s = new Sede(n, AnagraficheService.chiave(n), sedi.ordineMassimo() + 1,
                            LocalDateTime.now(clock).withNano(0));
                    s.setPersonale(Boolean.TRUE.equals(personale));
                    return new Esito(dto(sedi.save(s), 0), true);
                });
    }

    @Transactional
    public SedeDto aggiorna(Long id, SedeInput in) {
        Sede s = sedi.findById(id).orElseThrow(() -> new ErroreApi(HttpStatus.NOT_FOUND, "Sede non trovata."));
        if (in == null) {
            return dto(s);
        }
        if (in.nome() != null) {
            String n = nomeObbligatorio(in.nome());
            String chiave = AnagraficheService.chiave(n);
            if (sedi.findByNomeChiave(chiave).filter(altra -> !altra.getId().equals(s.getId())).isPresent()) {
                throw new ErroreApi(HttpStatus.CONFLICT, "Esiste già una sede con questo nome.");
            }
            s.setNome(n);
            s.setNomeChiave(chiave);
        }
        boolean archiviare = in.archiviata() != null && in.archiviata() && !s.isArchiviata();
        boolean renderePersonale = Boolean.TRUE.equals(in.personale()) && !s.isPersonale();
        // i conteggi prima di cambiare l'entita'
        if (archiviare && sedi.countByArchiviataFalse() <= 1) {
            throw new ErroreApi(HttpStatus.CONFLICT, "Non si può archiviare l'ultima sede attiva.");
        }
        // il locale deve avere almeno una sede attiva e non personale
        if ((archiviare || renderePersonale) && !s.isArchiviata() && !s.isPersonale()
                && sedi.countByArchiviataFalseAndPersonaleFalse() <= 1) {
            throw new ErroreApi(HttpStatus.CONFLICT, archiviare
                    ? "Non si può archiviare l'ultima sede attiva del locale (le altre sono personali)."
                    : "L'ultima sede attiva del locale non può diventare personale.");
        }
        if (in.archiviata() != null) {
            s.setArchiviata(in.archiviata());
        }
        if (in.personale() != null) {
            s.setPersonale(in.personale());
        }
        return dto(sedi.save(s));
    }

    // ---- uso da movimenti, ripetizioni e importazione ----

    /**
     * La sede di un movimento nuovo: quella indicata (che deve esistere e non essere archiviata); se manca, l'unica
     * sede attiva, altrimenti 400.
     */
    @Transactional(readOnly = true)
    public Sede perNuovoMovimento(Long sedeId) {
        if (sedeId != null) {
            Sede s = trova(sedeId);
            if (s.isArchiviata()) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "La sede «" + s.getNome() + "» è archiviata.");
            }
            return s;
        }
        List<Sede> attive = attive();
        if (attive.size() == 1) {
            return attive.get(0);
        }
        throw new ErroreApi(HttpStatus.BAD_REQUEST, "Scegli la sede: ce n'è più di una.");
    }

    /** Una sede esistente (anche archiviata), per riferirsi a un movimento che c'e' gia'. */
    @Transactional(readOnly = true)
    public Sede trova(Long sedeId) {
        return sedi.findById(sedeId).orElseThrow(() -> new ErroreApi(HttpStatus.BAD_REQUEST, "Sede non trovata."));
    }

    /**
     * Il filtro {@code sedi=1,2} di elenchi, riepilogo, statistiche ed esportazione: gli id dati (sedi personali comprese);
     * se assente o vuoto, tutte le sedi non personali (archiviate comprese). Null = nessun filtro (tutte le sedi): succede
     * solo quando non esistono sedi personali, cosi' le query restano quelle di prima.
     */
    @Transactional(readOnly = true)
    public Set<Long> filtro(String parametro) {
        Set<Long> ids = idsDa(parametro);
        if (ids != null || !sedi.existsByPersonaleTrue()) {
            return ids;
        }
        Set<Long> delLocale = new LinkedHashSet<>();
        for (Sede s : tutte()) {
            if (!s.isPersonale()) {
                delLocale.add(s.getId());
            }
        }
        return delLocale;
    }

    /**
     * Il parametro {@code sedi=1,2}: gli id, oppure null se assente o vuoto (= tutte le sedi, archiviate comprese).
     * Un valore che non e' un numero e' un 400. Per i filtri dei totali si usa {@link #filtro(String)}.
     */
    public static Set<Long> idsDa(String parametro) {
        if (parametro == null || parametro.isBlank()) {
            return null;
        }
        Set<Long> ids = new LinkedHashSet<>();
        for (String voce : parametro.split(",")) {
            String v = voce.trim();
            if (v.isEmpty()) {
                continue;
            }
            try {
                ids.add(Long.parseLong(v));
            } catch (NumberFormatException e) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "sedi: valore non valido: " + v);
            }
        }
        return ids.isEmpty() ? null : ids;
    }

    // ---- conversioni ----

    private static String nomeObbligatorio(String nome) {
        String n = AnagraficheService.pulisci(nome);
        if (n == null) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il nome della sede è obbligatorio.");
        }
        if (n.length() > AnagraficheService.NOME_MASSIMO) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST,
                    "Il nome della sede è troppo lungo (massimo " + AnagraficheService.NOME_MASSIMO + " caratteri).");
        }
        return n;
    }

    private SedeDto dto(Sede s) {
        return dto(s, conteggi().getOrDefault(s.getId(), 0L));
    }

    private static SedeDto dto(Sede s, long numeroMovimenti) {
        return new SedeDto(s.getId(), s.getNome(), s.isArchiviata(), s.isPersonale(), s.getOrdine(), numeroMovimenti);
    }
}
