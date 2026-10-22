package it.contabilita.programma;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.contabilita.api.ErroreApi;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Ripristino da copia di sicurezza (docs/api.md): elenco delle copie e richiesta di ripristino.
 *
 * <p>Il ripristino vero NON avviene qui: sostituire il file di un database SQLite aperto da Hikari e
 * Hibernate e' fragile. Qui si valida la copia, si salvano i dati attuali, si scrive il marcatore
 * {@code ripristino-in-attesa.json} nella cartella dati e si chiede l'uscita con codice 75; al
 * riavvio {@link RipristinoInSospeso} (prima di Spring) sostituisce il database.
 *
 * <p>Sicurezza: il nome della copia deve essere uno di quelli che l'elenco mostra (cartelle figlie
 * dirette della cartella delle copie); nessun percorso libero arriva al file system.
 */
@Service
public class RipristinoService {

    private static final Logger log = LoggerFactory.getLogger(RipristinoService.class);

    private static final Pattern NOME_COPIA = Pattern.compile(
            "(?:" + Pattern.quote(BackupService.PREFISSO_PRIMA_DEL_RIPRISTINO) + ")?"
                    + "(\\d{4}-\\d{2}-\\d{2}_\\d{6})(?:-\\d+)?");
    private static final DateTimeFormatter NOME_SOTTOCARTELLA = DateTimeFormatter.ofPattern("yyyy-MM-dd_HHmmss");
    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE_TIME;
    private static final ObjectMapper JSON = new ObjectMapper();

    public record Copia(String nome, String quando, long dimensioneByte) {
    }

    public record EsitoRichiesta(boolean riavvio, String copiaDiSicurezza) {
    }

    private final BackupService backup;
    private final DataSource dataSource;
    private final Clock clock;
    private final Uscita uscita;
    private final Path cartellaDati;

    public RipristinoService(BackupService backup, DataSource dataSource, Clock clock, Uscita uscita,
                             @Value("${contabilita.dati}") String cartellaDati) {
        this.backup = backup;
        this.dataSource = dataSource;
        this.clock = clock;
        this.uscita = uscita;
        this.cartellaDati = Path.of(cartellaDati).toAbsolutePath();
    }

    /** Le copie presenti nella cartella configurata, dalla piu' recente. Vuoto se non c'e' cartella. */
    public List<Copia> elenca() {
        String cartella = backup.cartellaConfigurata();
        if (cartella == null) {
            return List.of();
        }
        return elencaIn(Path.of(cartella));
    }

    private List<Copia> elencaIn(Path cartella) {
        List<Copia> copie = new ArrayList<>();
        try (Stream<Path> figli = Files.list(cartella)) {
            for (Path figlio : (Iterable<Path>) figli::iterator) {
                String nome = figlio.getFileName().toString();
                Matcher m = NOME_COPIA.matcher(nome);
                Path file = figlio.resolve(BackupService.NOME_FILE_DATABASE);
                if (!m.matches() || !Files.isDirectory(figlio) || !Files.isRegularFile(file)) {
                    continue;
                }
                copie.add(new Copia(nome, quando(m.group(1), file), Files.size(file)));
            }
        } catch (IOException e) {
            log.warn("Impossibile elencare le copie in {}: {}", cartella, e.toString());
            return List.of();
        }
        copie.sort(Comparator.comparing(Copia::quando).thenComparing(Copia::nome).reversed());
        return copie;
    }

    private static String quando(String dalNome, Path file) {
        try {
            return LocalDateTime.parse(dalNome, NOME_SOTTOCARTELLA).format(ISO);
        } catch (DateTimeParseException e) {
            try {
                return LocalDateTime.ofInstant(Instant.ofEpochMilli(Files.getLastModifiedTime(file).toMillis()),
                        ZoneId.systemDefault()).withNano(0).format(ISO);
            } catch (IOException ex) {
                return "";
            }
        }
    }

    public EsitoRichiesta ripristina(String nome) {
        if (nome == null || nome.isBlank() || nome.equals(".") || nome.contains("..")
                || nome.contains("/") || nome.contains("\\") || nome.contains(":") || !nome.equals(nome.strip())) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "copia: nome non valido");
        }
        String cartella = backup.cartellaConfigurata();
        if (cartella == null) {
            throw new ErroreApi(HttpStatus.CONFLICT, "Nessuna cartella per le copie: sceglila prima.");
        }
        Path marcatore = cartellaDati.resolve(RipristinoInSospeso.MARCATORE);
        if (Files.exists(marcatore)) {
            throw new ErroreApi(HttpStatus.CONFLICT, "C'è già un ripristino in attesa: l'app si sta per riavviare.");
        }
        if (elencaIn(Path.of(cartella)).stream().noneMatch(c -> c.nome().equals(nome))) {
            throw new ErroreApi(HttpStatus.NOT_FOUND, "Copia non trovata.");
        }
        Path file = Path.of(cartella).resolve(nome).resolve(BackupService.NOME_FILE_DATABASE).toAbsolutePath().normalize();

        Set<String> idDellaCopia;
        try {
            idDellaCopia = VerificaCopia.controlla(file);
        } catch (VerificaCopia.CopiaNonValida e) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        Set<String> idAttuali = new HashSet<>(new JdbcTemplate(dataSource)
                .queryForList("SELECT id FROM databasechangelog", String.class));
        if (!idAttuali.containsAll(idDellaCopia)) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST,
                    "La copia è di una versione più recente del programma: aggiorna il programma prima di ripristinarla.");
        }

        Path sicurezza = backup.copiaPrimaDelRipristino();
        String nomeSicurezza = sicurezza.getFileName().toString();

        try {
            scriviMarcatore(marcatore, file, nomeSicurezza);
        } catch (IOException e) {
            log.error("Impossibile scrivere il marcatore del ripristino: {}", e.toString(), e);
            throw new ErroreApi(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Impossibile preparare il ripristino (cartella dati non scrivibile). I dati attuali non sono stati toccati.");
        }
        log.info("Ripristino richiesto dalla copia {}: copia di sicurezza {}, riavvio con codice {}.",
                nome, nomeSicurezza, Uscita.CODICE_RIAVVIO);
        uscita.esci(Uscita.CODICE_RIAVVIO);
        return new EsitoRichiesta(true, nomeSicurezza);
    }

    private void scriviMarcatore(Path marcatore, Path file, String nomeSicurezza) throws IOException {
        ObjectNode n = JSON.createObjectNode();
        n.put("copia", file.toString());
        n.put("richiestoIl", LocalDateTime.now(clock).withNano(0).format(ISO));
        n.put("copiaDiSicurezza", nomeSicurezza);
        Path temporaneo = marcatore.resolveSibling(marcatore.getFileName() + ".tmp");
        JSON.writerWithDefaultPrettyPrinter().writeValue(temporaneo.toFile(), n);
        try {
            Files.move(temporaneo, marcatore, StandardCopyOption.ATOMIC_MOVE);
        } catch (java.nio.file.AtomicMoveNotSupportedException e) {
            Files.move(temporaneo, marcatore, StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
