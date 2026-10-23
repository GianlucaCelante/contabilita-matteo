package it.contabilita.programma;

import it.contabilita.api.ErroreApi;
import it.contabilita.api.VersioneController;
import it.contabilita.dati.Impostazione;
import it.contabilita.dati.ImpostazioneRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Copie di sicurezza (docs/api.md, "Programma, rete, impostazioni"): una copia coerente del
 * database in una sottocartella datata {@code AAAA-MM-GG_HHMMSS} della cartella scelta.
 *
 * <p>Adattato da {@code BackupService} di etichetta-da-matteo: stessa copia con {@code VACUUM INTO}
 * (una normale istruzione SQL su una connessione del pool: snapshot coerente anche in WAL, senza
 * bloccare gli scrittori), stesso nome datato con progressivo se due copie cadono nello stesso
 * secondo, stessa pulizia (si tengono le ultime 10), stesso recupero all'avvio se il PC era spento
 * alle 03:00. Fase 4: la copia datata include anche la cartella {@code allegati/} (se esiste), accanto a
 * {@code contabilita.db}; se la sua copia fallisce, fallisce l'intera copia e la cartella parziale si elimina.
 *
 * <p>Lo stato vive nella tabella {@code impostazione}: {@code backup.cartella} (dove copiare),
 * {@code backup.ultimo.quando} e {@code backup.ultimo.cartella} (ultima copia RIUSCITA; un
 * tentativo fallito non la cancella).
 */
@Component
public class BackupService {

    private static final Logger log = LoggerFactory.getLogger(BackupService.class);

    private static final String CHIAVE_CARTELLA = "backup.cartella";
    private static final String CHIAVE_ULTIMO_QUANDO = "backup.ultimo.quando";
    private static final String CHIAVE_ULTIMO_CARTELLA = "backup.ultimo.cartella";

    private static final LocalTime ORARIO_NOTTURNO = LocalTime.of(3, 0);
    private static final DateTimeFormatter NOME_SOTTOCARTELLA = DateTimeFormatter.ofPattern("yyyy-MM-dd_HHmmss");
    private static final Pattern NOME_CARTELLA_COPIA = Pattern.compile("\\d{4}-\\d{2}-\\d{2}_\\d{6}(-\\d+)?");
    private static final int COPIE_DA_TENERE = 10;
    static final String NOME_FILE_DATABASE = "contabilita.db";
    /** Cartella dei file allegati, sia nella cartella dati sia dentro una copia datata (fase 4). */
    static final String NOME_CARTELLA_ALLEGATI = "allegati";
    /** Cartella delle copie predefinita, dentro la cartella dati. */
    static final String NOME_CARTELLA_COPIE = "copie";
    static final String PREFISSO_PRIMA_DEL_RIPRISTINO = "prima-del-ripristino-";

    public record UltimoBackup(String quando, String cartella) {
    }

    public record StatoProgramma(String versione, String cartellaBackup, boolean cartellaPredefinita,
                                 UltimoBackup ultimoBackup) {
    }

    public record CartellaBackup(String cartella) {
    }

    private final ImpostazioneRepository impostazioni;
    private final DataSource dataSource;
    private final Clock clock;
    private final Path cartellaAllegati;
    private final Path cartellaDati;
    /** Dove vanno le copie se non e' stata scelta una cartella: {@code <cartella dati>/copie}. */
    private final Path cartellaPredefinita;

    /** Una sola copia alla volta (409 se una copia e' gia' in corso). */
    private final AtomicBoolean inCorso = new AtomicBoolean(false);

    public BackupService(ImpostazioneRepository impostazioni, DataSource dataSource, Clock clock,
                         @org.springframework.beans.factory.annotation.Value("${contabilita.dati}") String cartellaDati) {
        this.impostazioni = impostazioni;
        this.dataSource = dataSource;
        this.clock = clock;
        this.cartellaDati = Path.of(cartellaDati).toAbsolutePath().normalize();
        this.cartellaAllegati = this.cartellaDati.resolve(NOME_CARTELLA_ALLEGATI);
        this.cartellaPredefinita = this.cartellaDati.resolve(NOME_CARTELLA_COPIE);
    }

    /** SOLO per i test: simula una copia gia' in corso. */
    void simulaCopiaInCorsoPerTest(boolean valore) {
        inCorso.set(valore);
    }

    public StatoProgramma stato() {
        Path cartella = cartellaEffettiva();
        String quando = leggiValore(CHIAVE_ULTIMO_QUANDO);
        UltimoBackup ultimo = quando != null
                ? new UltimoBackup(quando, leggiValore(CHIAVE_ULTIMO_CARTELLA)) : null;
        return new StatoProgramma(VersioneController.versione(), cartella.toString(),
                cartella.equals(cartellaPredefinita), ultimo);
    }

    /**
     * {@code cartella} vuota o null: torna alla cartella predefinita. Altrimenti il percorso deve essere
     * assoluto, creabile e scrivibile (si verifica creando la cartella e un file temporaneo) e non stare
     * dentro la cartella dati, tranne quella predefinita; se no 400.
     */
    public StatoProgramma impostaCartella(String cartella) {
        if (cartella == null || cartella.isBlank()) {
            impostazioni.deleteById(CHIAVE_CARTELLA);
        } else {
            Path percorso;
            try {
                percorso = Path.of(cartella.strip());
            } catch (RuntimeException e) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "La cartella delle copie non è un percorso valido.");
            }
            if (!percorso.isAbsolute()) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST,
                        "La cartella delle copie deve essere un percorso completo (per esempio D:\\Copie).");
            }
            percorso = percorso.normalize();
            if (percorso.equals(cartellaPredefinita)) {
                percorso = cartellaPredefinita;
            } else if (percorso.startsWith(cartellaDati)) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST,
                        "La cartella delle copie non può stare dentro i dati, tranne quella predefinita.");
            }
            verificaScrivibile(percorso);
            if (percorso.equals(cartellaPredefinita)) {
                impostazioni.deleteById(CHIAVE_CARTELLA);
            } else {
                impostazioni.save(new Impostazione(CHIAVE_CARTELLA, percorso.toString()));
            }
        }
        return stato();
    }

    private static void verificaScrivibile(Path cartella) {
        try {
            Files.createDirectories(cartella);
        } catch (IOException | RuntimeException e) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST,
                    "Non riesco a creare la cartella delle copie: controlla il percorso e i permessi.");
        }
        try {
            Path prova = Files.createTempFile(cartella, "prova-", ".tmp");
            Files.deleteIfExists(prova);
        } catch (IOException | RuntimeException e) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "Non posso scrivere nella cartella delle copie: controlla i permessi.");
        }
    }

    /** Dove vanno le copie ora: quella scelta dall'utente, altrimenti {@code <cartella dati>/copie}. */
    public Path cartellaEffettiva() {
        String scelta = leggiValore(CHIAVE_CARTELLA);
        return scelta == null || scelta.isBlank() ? cartellaPredefinita : Path.of(scelta);
    }

    /** Copia subito. 409 se una copia e' gia' in corso; 500 se la copia fallisce. */
    public CartellaBackup eseguiSubito() {
        if (!inCorso.compareAndSet(false, true)) {
            throw new ErroreApi(HttpStatus.CONFLICT, "Una copia è già in corso.");
        }
        try {
            return new CartellaBackup(copia(cartellaEffettiva()).toString());
        } catch (Exception e) {
            log.error("Copia di sicurezza fallita: {}", e.toString(), e);
            throw new ErroreApi(HttpStatus.INTERNAL_SERVER_ERROR, messaggioErrore(e));
        } finally {
            inCorso.set(false);
        }
    }

    /**
     * Copia dei dati attuali in {@code prima-del-ripristino-AAAA-MM-GG_HHMMSS} nella cartella delle
     * copie, prima di un ripristino. 409 se una copia e' in corso; 500 se fallisce.
     */
    public Path copiaPrimaDelRipristino() {
        if (!inCorso.compareAndSet(false, true)) {
            throw new ErroreApi(HttpStatus.CONFLICT, "Una copia è già in corso.");
        }
        try {
            return copia(cartellaEffettiva(), PREFISSO_PRIMA_DEL_RIPRISTINO, false);
        } catch (Exception e) {
            log.error("Copia di sicurezza prima del ripristino fallita: {}", e.toString(), e);
            throw new ErroreApi(HttpStatus.INTERNAL_SERVER_ERROR, messaggioErrore(e));
        } finally {
            inCorso.set(false);
        }
    }

    // ---- automatico ----

    @Scheduled(cron = "0 0 3 * * *")
    void backupNotturno() {
        eseguiSeDovuto();
    }

    /** Se il PC era spento alle 03:00, la copia mancata parte appena il servizio e' pronto. */
    @EventListener(ApplicationReadyEvent.class)
    void controllaRecuperoAllAvvio() {
        eseguiSeDovuto();
    }

    void eseguiSeDovuto() {
        Path cartella = cartellaEffettiva();
        String quando = leggiValore(CHIAVE_ULTIMO_QUANDO);
        if (!backupDovuto(quando == null ? null : LocalDateTime.parse(quando), LocalDateTime.now(clock))) {
            return;
        }
        if (!inCorso.compareAndSet(false, true)) {
            log.info("Copia di sicurezza dovuta, ma una copia è già in corso.");
            return;
        }
        try {
            copia(cartella);
        } catch (Exception e) {
            log.error("Copia di sicurezza automatica fallita: {}", e.toString(), e);
        } finally {
            inCorso.set(false);
        }
    }

    /** Vero se dall'ultimo orario notturno gia' passato non c'e' una copia riuscita. */
    static boolean backupDovuto(LocalDateTime ultimaRiuscita, LocalDateTime adesso) {
        LocalDateTime oggiAlleTre = adesso.toLocalDate().atTime(ORARIO_NOTTURNO);
        LocalDateTime ultimoOrario = adesso.isBefore(oggiAlleTre) ? oggiAlleTre.minusDays(1) : oggiAlleTre;
        return ultimaRiuscita == null || ultimaRiuscita.isBefore(ultimoOrario);
    }

    // ---- la copia vera ----

    private Path copia(Path cartella) throws IOException, SQLException {
        return copia(cartella, "", true);
    }

    /**
     * {@code registra} = copia "normale": aggiorna l'ultima copia riuscita e fa pulizia delle vecchie.
     * La copia di sicurezza prima di un ripristino ({@code prefisso} non vuoto) non fa ne' l'una ne' l'altra.
     */
    private Path copia(Path cartella, String prefisso, boolean registra) throws IOException, SQLException {
        LocalDateTime quando = LocalDateTime.now(clock).withNano(0);
        Path destinazione = sottocartellaLibera(cartella, prefisso, quando);
        Path allegatiPrecedenti = allegatiDellaCopiaPrecedente(cartella);
        Files.createDirectories(destinazione);
        try {
            copiaDatabase(destinazione.resolve(NOME_FILE_DATABASE));
            // Gli allegati hanno nomi univoci e non cambiano mai una volta scritti: copiarli dopo il database
            // al piu' ne porta qualcuno in piu' di quelli che il database conosce, mai uno in meno.
            if (Files.isDirectory(cartellaAllegati)) {
                // Copia incrementale: quelli gia' presenti nella copia precedente non si ricopiano (collegamento fisso).
                CopiaCartelle.copia(cartellaAllegati, destinazione.resolve(NOME_CARTELLA_ALLEGATI), allegatiPrecedenti);
            }
        } catch (IOException | SQLException | RuntimeException e) {
            eliminaSilenziosamente(destinazione);
            throw e;
        }
        log.info("Copia di sicurezza riuscita in {}", destinazione);
        if (registra) {
            salva(CHIAVE_ULTIMO_QUANDO, quando.toString());
            salva(CHIAVE_ULTIMO_CARTELLA, destinazione.toString());
            pulisciCopieVecchie(cartella);
        }
        return destinazione;
    }

    /** Gli allegati dell'ultima copia datata che ne ha (la piu' recente per nome), o null. */
    private static Path allegatiDellaCopiaPrecedente(Path cartella) {
        if (!Files.isDirectory(cartella)) {
            return null;
        }
        try (Stream<Path> elenco = Files.list(cartella)) {
            return elenco
                    .filter(Files::isDirectory)
                    .filter(p -> NOME_CARTELLA_COPIA.matcher(p.getFileName().toString()).matches())
                    .sorted(Comparator.comparing((Path p) -> p.getFileName().toString()).reversed())
                    .map(p -> p.resolve(NOME_CARTELLA_ALLEGATI))
                    .filter(Files::isDirectory)
                    .findFirst().orElse(null);
        } catch (IOException e) {
            return null; // senza riferimento si copia tutto: piu' lento, non sbagliato
        }
    }

    /** Nome datato; se esiste gia' (due copie nello stesso secondo) un progressivo -2, -3, ... */
    private static Path sottocartellaLibera(Path cartella, String prefisso, LocalDateTime quando) {
        String base = prefisso + quando.format(NOME_SOTTOCARTELLA);
        Path candidata = cartella.resolve(base);
        for (int n = 2; Files.exists(candidata); n++) {
            candidata = cartella.resolve(base + "-" + n);
        }
        return candidata;
    }

    /** {@code VACUUM INTO}: il file di destinazione NON deve esistere gia'. */
    private void copiaDatabase(Path destinazioneFile) throws SQLException {
        try (Connection connessione = dataSource.getConnection();
             PreparedStatement comando = connessione.prepareStatement("VACUUM INTO ?")) {
            comando.setString(1, destinazioneFile.toString());
            comando.execute();
        }
    }

    static String messaggioErrore(Exception e) {
        if (e instanceof java.nio.file.AccessDeniedException) {
            return "Permessi insufficienti per scrivere nella cartella di destinazione.";
        }
        if (e instanceof java.nio.file.NoSuchFileException) {
            return "La cartella di destinazione non esiste più.";
        }
        if (e instanceof IOException) {
            return "Errore di scrittura nella cartella di destinazione: verifica che sia raggiungibile e che ci sia spazio libero.";
        }
        if (e instanceof SQLException) {
            return "Errore durante la copia del database: il database originale non è stato toccato.";
        }
        return "Errore imprevisto durante la copia di sicurezza.";
    }

    /** Dopo una copia riuscita tiene solo le 10 sottocartelle piu' recenti (riconosciute dal nome). */
    private void pulisciCopieVecchie(Path cartella) {
        List<Path> sottocartelle;
        try (Stream<Path> elenco = Files.list(cartella)) {
            sottocartelle = elenco
                    .filter(Files::isDirectory)
                    .filter(p -> NOME_CARTELLA_COPIA.matcher(p.getFileName().toString()).matches())
                    .sorted(Comparator.comparing((Path p) -> p.getFileName().toString()).reversed())
                    .toList();
        } catch (IOException e) {
            log.warn("Impossibile elencare {} per la pulizia delle vecchie copie: {}", cartella, e.toString());
            return;
        }
        for (Path vecchia : sottocartelle.subList(Math.min(COPIE_DA_TENERE, sottocartelle.size()), sottocartelle.size())) {
            try {
                eliminaRicorsivamente(vecchia);
            } catch (IOException e) {
                log.warn("Impossibile eliminare la vecchia copia {}: {}", vecchia, e.toString());
            }
        }
    }

    private static void eliminaSilenziosamente(Path radice) {
        try {
            eliminaRicorsivamente(radice);
        } catch (IOException ignorato) {
            // pulizia best effort
        }
    }

    private static void eliminaRicorsivamente(Path radice) throws IOException {
        try (Stream<Path> tutti = Files.walk(radice)) {
            for (Path p : tutti.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(p);
            }
        }
    }

    private String leggiValore(String chiave) {
        return impostazioni.findById(chiave).map(Impostazione::getValore).orElse(null);
    }

    private void salva(String chiave, String valore) {
        impostazioni.save(new Impostazione(chiave, valore));
    }
}
