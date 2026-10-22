package it.contabilita.ricorrenze;

import it.contabilita.api.ErroreApi;
import it.contabilita.dati.Documento;
import it.contabilita.dati.Movimento;
import it.contabilita.dati.MovimentoRepository;
import it.contabilita.dati.Origine;
import it.contabilita.dati.Ricorrenza;
import it.contabilita.dati.RicorrenzaRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;

/**
 * Ricorrenze mensili (docs/api.md, "Ricorrenze"): crea il modello dal primo movimento e genera
 * le occorrenze mancanti, all'avvio e ogni giorno alle 03:05, recuperando i mesi saltati fino a
 * oggi. Il giorno oltre la fine del mese diventa l'ultimo giorno del mese. Idempotente.
 */
@Service
public class RicorrenzeService {

    private static final Logger log = LoggerFactory.getLogger(RicorrenzeService.class);

    private final RicorrenzaRepository ricorrenze;
    private final MovimentoRepository movimenti;
    private final Clock clock;
    private final TransactionTemplate transazione;

    public RicorrenzeService(RicorrenzaRepository ricorrenze, MovimentoRepository movimenti, Clock clock,
                             PlatformTransactionManager gestoreTransazioni) {
        this.ricorrenze = ricorrenze;
        this.movimenti = movimenti;
        this.clock = clock;
        this.transazione = new TransactionTemplate(gestoreTransazioni);
    }

    public static void validaGiorno(Integer giorno) {
        if (giorno == null || giorno < 1 || giorno > 31) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il giorno della ripetizione deve essere un numero da 1 a 31.");
        }
    }

    public static void validaDocumentoRicorrente(Documento documento) {
        if (documento == Documento.RETRIBUZIONE_EXTRA) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "La retribuzione extra non può essere ripetuta ogni mese: va inserita a mano.");
        }
    }

    /** Crea la ricorrenza con il modello preso dal movimento (che ne e' la prima occorrenza) e la collega. */
    public Ricorrenza creaDa(Movimento m, int giorno) {
        validaGiorno(giorno);
        validaDocumentoRicorrente(m.getDocumento());
        Ricorrenza r = new Ricorrenza();
        r.setGiorno(giorno);
        r.setAttiva(true);
        copiaModello(m, r);
        YearMonth mese = YearMonth.from(m.getData());
        r.setUltimoMese(mese);
        r.setCreataIl(LocalDateTime.now(clock).withNano(0));
        r = ricorrenze.save(r);
        m.setRicorrenza(r);
        m.setAnnoMese(mese.toString());
        return r;
    }

    /** Aggiorna il modello con i campi del movimento (modifica con ambito QUESTO_E_PROSSIMI). */
    public void copiaModello(Movimento m, Ricorrenza r) {
        r.setTipo(m.getTipo());
        r.setDocumento(m.getDocumento());
        r.setImportoCent(m.getImportoCent());
        r.setCategoria(m.getCategoria());
        r.setFornitore(m.getFornitore());
        r.setDipendente(m.getDipendente());
        r.setDescrizione(m.getDescrizione());
        r.setNote(m.getNote());
    }

    @Transactional
    public void ferma(Long id) {
        Ricorrenza r = ricorrenze.findById(id)
                .orElseThrow(() -> new ErroreApi(HttpStatus.NOT_FOUND, "Ricorrenza non trovata."));
        r.setAttiva(false);
    }

    // ---- generazione ----

    @EventListener(ApplicationReadyEvent.class)
    void alAvvio() {
        generaProtetto();
    }

    @Scheduled(cron = "0 5 3 * * *")
    void ogniGiorno() {
        generaProtetto();
    }

    private void generaProtetto() {
        try {
            int n = generaOccorrenzeMancanti(LocalDate.now(clock));
            if (n > 0) {
                log.info("Ricorrenze: registrate {} occorrenze.", n);
            }
        } catch (RuntimeException e) {
            log.error("Ricorrenze: generazione fallita", e);
        }
    }

    /** Registra le occorrenze dovute fino a {@code oggi} (incluso); torna quante ne ha create. */
    public int generaOccorrenzeMancanti(LocalDate oggi) {
        Integer creati = transazione.execute(stato -> {
            int totale = 0;
            for (Ricorrenza r : ricorrenze.findByAttivaTrueOrderById()) {
                totale += generaPer(r, oggi);
            }
            return totale;
        });
        return creati == null ? 0 : creati;
    }

    private int generaPer(Ricorrenza r, LocalDate oggi) {
        int creati = 0;
        YearMonth mese = r.getUltimoMese().plusMonths(1);
        while (true) {
            LocalDate data = mese.atDay(Math.min(r.getGiorno(), mese.lengthOfMonth()));
            if (data.isAfter(oggi)) {
                break;
            }
            if (!movimenti.existsByRicorrenzaIdAndAnnoMese(r.getId(), mese.toString())) {
                movimenti.save(occorrenza(r, data, mese));
                creati++;
            }
            r.setUltimoMese(mese);
            mese = mese.plusMonths(1);
        }
        return creati;
    }

    private Movimento occorrenza(Ricorrenza r, LocalDate data, YearMonth mese) {
        LocalDateTime adesso = LocalDateTime.now(clock).withNano(0);
        Movimento m = new Movimento();
        m.setData(data);
        m.setTipo(r.getTipo());
        m.setDocumento(r.getDocumento());
        m.setImportoCent(r.getImportoCent());
        m.setCategoria(r.getCategoria());
        m.setFornitore(r.getFornitore());
        m.setDipendente(r.getDipendente());
        m.setDescrizione(r.getDescrizione());
        m.setNote(r.getNote());
        m.setOrigine(Origine.RICORRENZA);
        m.setRicorrenza(r);
        m.setAnnoMese(mese.toString());
        m.setCreatoIl(adesso);
        m.setModificatoIl(adesso);
        return m;
    }
}
