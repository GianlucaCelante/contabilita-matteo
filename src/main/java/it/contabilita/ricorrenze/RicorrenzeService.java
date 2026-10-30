package it.contabilita.ricorrenze;

import it.contabilita.api.Dto.RicorrenzaInput;
import it.contabilita.api.ErroreApi;
import it.contabilita.dati.Documento;
import it.contabilita.dati.Movimento;
import it.contabilita.dati.MovimentoRepository;
import it.contabilita.dati.Origine;
import it.contabilita.dati.Ricorrenza;
import it.contabilita.dati.RicorrenzaRepository;
import it.contabilita.dati.UnitaRipetizione;
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
 * Ripetizioni (docs/api.md, "Ricorrenze"): ogni N giorni, settimane, mesi o anni (di base: ogni mese).
 * Crea il modello dal primo movimento e genera le occorrenze mancanti, all'avvio e ogni giorno alle 03:05,
 * recuperando le scadenze saltate fino a oggi. Per mesi e anni il giorno oltre la fine del mese diventa
 * l'ultimo giorno del mese. Si puo' fermare e riattivare (senza recuperare quello che e' passato da ferma). Idempotente.
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

    // ---- validazione ----

    public static void validaGiorno(Integer giorno) {
        if (giorno == null || giorno < 1 || giorno > 31) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Il giorno della ripetizione deve essere un numero da 1 a 31.");
        }
    }

    /** Frequenza e giorno di una ripetizione: senza unita e intervallo vale «ogni mese»; il giorno serve per mesi e anni. */
    public static void valida(RicorrenzaInput in) {
        UnitaRipetizione unita = unitaDi(in, UnitaRipetizione.MESI);
        int intervallo = intervalloDi(in, 1);
        if (intervallo < 1 || intervallo > unita.massimo()) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST,
                    "Ogni quanto: da 1 a " + unita.massimo() + " " + unita.nome() + ".");
        }
        if (unita.usaIlGiornoDelMese()) {
            validaGiorno(in.giorno());
        }
    }

    public static void validaDocumentoRicorrente(Documento documento) {
        if (documento == Documento.RETRIBUZIONE_EXTRA) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "La retribuzione extra non può essere ripetuta: va inserita a mano.");
        }
    }

    private static UnitaRipetizione unitaDi(RicorrenzaInput in, UnitaRipetizione predefinita) {
        return in == null || in.unita() == null ? predefinita : in.unita();
    }

    private static int intervalloDi(RicorrenzaInput in, int predefinito) {
        return in == null || in.intervallo() == null ? predefinito : in.intervallo();
    }

    // ---- calcolo delle scadenze ----

    /** La scadenza dopo {@code da}: per mesi e anni nel giorno scelto (accorciato nei mesi piu' corti). */
    static LocalDate successiva(LocalDate da, UnitaRipetizione unita, int intervallo, int giorno) {
        return switch (unita) {
            case GIORNI -> da.plusDays(intervallo);
            case SETTIMANE -> da.plusWeeks(intervallo);
            case MESI -> conGiorno(YearMonth.from(da).plusMonths(intervallo), giorno);
            case ANNI -> conGiorno(YearMonth.from(da).plusMonths(12L * intervallo), giorno);
        };
    }

    private static LocalDate conGiorno(YearMonth mese, int giorno) {
        return mese.atDay(Math.min(giorno, mese.lengthOfMonth()));
    }

    // ---- creazione e modifica ----

    /** Crea la ripetizione con il modello preso dal movimento (che ne e' la prima occorrenza) e la collega. */
    public Ricorrenza creaDa(Movimento m, RicorrenzaInput in) {
        valida(in);
        validaDocumentoRicorrente(m.getDocumento());
        UnitaRipetizione unita = unitaDi(in, UnitaRipetizione.MESI);
        int intervallo = intervalloDi(in, 1);
        int giorno = unita.usaIlGiornoDelMese() ? in.giorno() : m.getData().getDayOfMonth();
        Ricorrenza r = new Ricorrenza();
        r.setUnita(unita);
        r.setIntervallo(intervallo);
        r.setGiorno(giorno);
        r.setAttiva(true);
        copiaModello(m, r);
        YearMonth mese = YearMonth.from(m.getData());
        r.setProssimaData(successiva(m.getData(), unita, intervallo, giorno));
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
        r.setSede(m.getSede());
        r.setDescrizione(m.getDescrizione());
        r.setNote(m.getNote());
    }

    /**
     * Cambia frequenza e/o giorno (modifica con ambito QUESTO_E_PROSSIMI). Vale dalla prossima scadenza ancora da
     * registrare: per mesi e anni resta lo stesso mese con il nuovo giorno, passando da giorni o settimane a mesi non si
     * va mai prima della scadenza che c'era, e da mesi a giorni o settimane si prosegue da quella scadenza.
     */
    public void aggiornaFrequenza(Ricorrenza r, RicorrenzaInput in) {
        if (in == null) {
            return;
        }
        UnitaRipetizione prima = r.getUnita();
        UnitaRipetizione unita = unitaDi(in, prima);
        int intervallo = intervalloDi(in, r.getIntervallo());
        int giorno = unita.usaIlGiornoDelMese() && in.giorno() != null ? in.giorno() : r.getGiorno();
        boolean cambiata = unita != prima || intervallo != r.getIntervallo() || giorno != r.getGiorno();
        r.setUnita(unita);
        r.setIntervallo(intervallo);
        r.setGiorno(giorno);
        if (!cambiata) {
            return;
        }
        LocalDate scadenza = r.getProssimaData();
        if (unita.usaIlGiornoDelMese()) {
            LocalDate nuova = conGiorno(YearMonth.from(scadenza), giorno);
            if (!prima.usaIlGiornoDelMese() && nuova.isBefore(scadenza)) {
                nuova = successiva(nuova, unita, intervallo, giorno);
            }
            r.setProssimaData(nuova);
        }
    }

    @Transactional
    public void ferma(Long id) {
        trova(id).setAttiva(false);
    }

    /** Riattiva una ripetizione ferma: riparte dalla prossima scadenza futura, senza recuperare quelle passate da ferma. */
    @Transactional
    public void riattiva(Long id) {
        Ricorrenza r = trova(id);
        if (r.isAttiva()) {
            return;
        }
        LocalDate oggi = LocalDate.now(clock);
        LocalDate scadenza = r.getProssimaData();
        while (!scadenza.isAfter(oggi)) {
            scadenza = successiva(scadenza, r.getUnita(), r.getIntervallo(), r.getGiorno());
        }
        r.setProssimaData(scadenza);
        r.setAttiva(true);
    }

    private Ricorrenza trova(Long id) {
        return ricorrenze.findById(id)
                .orElseThrow(() -> new ErroreApi(HttpStatus.NOT_FOUND, "Ricorrenza non trovata."));
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
        LocalDate data = r.getProssimaData();
        while (!data.isAfter(oggi)) {
            // un'occorrenza eliminata a mano non si ricrea: la scadenza avanza comunque; una gia' presente non si duplica
            if (!movimenti.existsByRicorrenzaIdAndData(r.getId(), data)) {
                movimenti.save(occorrenza(r, data));
                creati++;
            }
            r.setUltimoMese(YearMonth.from(data));
            data = successiva(data, r.getUnita(), r.getIntervallo(), r.getGiorno());
        }
        r.setProssimaData(data);
        return creati;
    }

    private Movimento occorrenza(Ricorrenza r, LocalDate data) {
        LocalDateTime adesso = LocalDateTime.now(clock).withNano(0);
        Movimento m = new Movimento();
        m.setData(data);
        m.setTipo(r.getTipo());
        m.setDocumento(r.getDocumento());
        m.setImportoCent(r.getImportoCent());
        m.setCategoria(r.getCategoria());
        m.setFornitore(r.getFornitore());
        m.setDipendente(r.getDipendente());
        m.setSede(r.getSede());
        m.setDescrizione(r.getDescrizione());
        m.setNote(r.getNote());
        m.setOrigine(Origine.RICORRENZA);
        m.setRicorrenza(r);
        m.setAnnoMese(YearMonth.from(data).toString());
        m.setCreatoIl(adesso);
        m.setModificatoIl(adesso);
        return m;
    }
}
