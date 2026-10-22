package it.contabilita.programma;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;

/**
 * Applica all'avvio, PRIMA di Spring (nessuna dipendenza da Spring), un ripristino richiesto
 * dall'app: se nella cartella dati c'e' {@code ripristino-in-attesa.json}, copia il file indicato
 * sopra {@code contabilita.db}, toglie i {@code -wal}/{@code -shm} residui e cancella il marcatore.
 *
 * <p>Il database non resta mai a meta': la copia va prima in un file temporaneo accanto al database
 * (controllato con {@link VerificaCopia}), poi lo sostituisce con uno spostamento atomico dove
 * possibile. Se qualcosa va storto prima della sostituzione il database attuale non viene toccato, il
 * marcatore diventa {@code ripristino-fallito.json} (con il campo {@code motivo}) e l'app parte
 * normalmente. Il marcatore si cancella per ultimo: se il processo muore a meta', al riavvio
 * successivo l'operazione si ripete da capo (e' idempotente).
 *
 * <p>Formato del marcatore: {@code {"copia": "<percorso assoluto del file .db>", "richiestoIl":
 * "<ISO>", "copiaDiSicurezza": "<nome cartella>"}}.
 */
public final class RipristinoInSospeso {

    public static final String MARCATORE = "ripristino-in-attesa.json";
    public static final String MARCATORE_FALLITO = "ripristino-fallito.json";
    public static final String MARCATORE_ALLEGATI_FALLITI = "ripristino-allegati-falliti.json";

    public enum Esito { NESSUNO, APPLICATO, FALLITO }

    private static final Logger log = LoggerFactory.getLogger(RipristinoInSospeso.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private RipristinoInSospeso() {
    }

    public static Esito applica(Path cartellaDati) {
        Path marcatore = cartellaDati.resolve(MARCATORE);
        if (!Files.isRegularFile(marcatore)) {
            return Esito.NESSUNO;
        }
        Path database = cartellaDati.resolve(BackupService.NOME_FILE_DATABASE);
        Path temporaneo = cartellaDati.resolve(BackupService.NOME_FILE_DATABASE + ".ripristino.tmp");
        ObjectNode richiesta = JSON.createObjectNode();
        try {
            JsonNode letto = JSON.readTree(marcatore.toFile());
            if (letto == null || !letto.isObject() || !letto.hasNonNull("copia")) {
                throw new IOException("il marcatore non contiene il campo \"copia\"");
            }
            richiesta = (ObjectNode) letto;
            Path copia = Path.of(letto.get("copia").asText());
            if (!Files.isRegularFile(copia)) {
                throw new IOException("la copia non esiste più: " + copia);
            }
            VerificaCopia.controlla(copia);
            Files.copy(copia, temporaneo, StandardCopyOption.REPLACE_EXISTING);
            VerificaCopia.controlla(temporaneo);
            sostituisci(temporaneo, database);
            Files.deleteIfExists(cartellaDati.resolve(BackupService.NOME_FILE_DATABASE + "-wal"));
            Files.deleteIfExists(cartellaDati.resolve(BackupService.NOME_FILE_DATABASE + "-shm"));
            ripristinaAllegati(cartellaDati, richiesta);
            Files.deleteIfExists(marcatore);
            log.info("Ripristino applicato: il database è ora la copia {} (copia di sicurezza dei dati precedenti: {}).",
                    copia, richiesta.path("copiaDiSicurezza").asText("?"));
            return Esito.APPLICATO;
        } catch (Exception e) {
            String motivo = e instanceof VerificaCopia.CopiaNonValida ? e.getMessage() : e.toString();
            log.error("Ripristino NON applicato, il database attuale resta com'è: {}", motivo, e);
            try {
                Files.deleteIfExists(temporaneo);
            } catch (IOException ignorato) {
                // pulizia best effort
            }
            segnalaFallimento(cartellaDati, marcatore, richiesta, motivo);
            return Esito.FALLITO;
        }
    }

    /**
     * Rimette a posto gli allegati SOLO se il marcatore ha il campo {@code allegati} (cioe' se la copia li
     * conteneva): la cartella della copia va in {@code allegati.ripristino.tmp}, quella attuale in
     * {@code allegati.vecchi.tmp}, poi la copia prende il nome {@code allegati} e la vecchia si cancella. Se il
     * processo muore a meta' il marcatore c'e' ancora e il ripristino si ripete da capo (i residui si ripuliscono).
     *
     * <p>Viene DOPO la sostituzione del database e non lancia mai: se gli allegati falliscono il database
     * ripristinato resta valido (l'app parte; gli allegati attuali tornano al loro posto), il problema e'
     * scritto in {@code ripristino-allegati-falliti.json} e i movimenti che puntano a file mancanti rispondono
     * 404 sull'allegato senza altri danni.
     */
    private static void ripristinaAllegati(Path cartellaDati, JsonNode richiesta) {
        if (richiesta == null || !richiesta.hasNonNull("allegati")) {
            return;
        }
        Path attuale = cartellaDati.resolve(BackupService.NOME_CARTELLA_ALLEGATI);
        Path temporanea = cartellaDati.resolve(BackupService.NOME_CARTELLA_ALLEGATI + ".ripristino.tmp");
        Path vecchia = cartellaDati.resolve(BackupService.NOME_CARTELLA_ALLEGATI + ".vecchi.tmp");
        try {
            Path sorgente = Path.of(richiesta.get("allegati").asText());
            if (!Files.isDirectory(sorgente)) {
                throw new IOException("la cartella degli allegati della copia non esiste più: " + sorgente);
            }
            CopiaCartelle.elimina(temporanea);
            CopiaCartelle.elimina(vecchia);
            CopiaCartelle.copia(sorgente, temporanea);
            if (Files.exists(attuale)) {
                Files.move(attuale, vecchia);
            }
            Files.move(temporanea, attuale);
            try {
                CopiaCartelle.elimina(vecchia);
            } catch (IOException e) {
                log.warn("Impossibile eliminare {}: {}", vecchia, e.toString());
            }
            log.info("Allegati ripristinati dalla copia {}.", sorgente);
        } catch (Exception e) {
            log.error("Allegati NON ripristinati (il database sì): {}", e.toString(), e);
            try {
                CopiaCartelle.elimina(temporanea);
                if (!Files.exists(attuale) && Files.exists(vecchia)) {
                    Files.move(vecchia, attuale); // rimette quelli di prima
                }
            } catch (IOException ignorato) {
                log.error("Impossibile rimettere a posto gli allegati precedenti: {}", ignorato.toString());
            }
            try {
                ObjectNode n = JSON.createObjectNode();
                n.put("allegati", richiesta.get("allegati").asText());
                n.put("motivo", e.toString());
                n.put("fallitoIl", LocalDateTime.now().withNano(0).toString());
                JSON.writerWithDefaultPrettyPrinter().writeValue(cartellaDati.resolve(MARCATORE_ALLEGATI_FALLITI).toFile(), n);
            } catch (IOException scrittura) {
                log.error("Impossibile scrivere {}: {}", MARCATORE_ALLEGATI_FALLITI, scrittura.toString());
            }
        }
    }

    private static void sostituisci(Path temporaneo, Path database) throws IOException {
        try {
            Files.move(temporaneo, database, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(temporaneo, database, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    /** Il marcatore diventa {@code ripristino-fallito.json} con il motivo; non si riprova ad ogni avvio. */
    private static void segnalaFallimento(Path cartellaDati, Path marcatore, ObjectNode richiesta, String motivo) {
        try {
            richiesta.put("motivo", motivo);
            richiesta.put("fallitoIl", LocalDateTime.now().withNano(0).toString());
            JSON.writerWithDefaultPrettyPrinter().writeValue(cartellaDati.resolve(MARCATORE_FALLITO).toFile(), richiesta);
            Files.deleteIfExists(marcatore);
        } catch (IOException e) {
            log.error("Impossibile scrivere {}: {}", MARCATORE_FALLITO, e.toString());
            try {
                Files.move(marcatore, cartellaDati.resolve(MARCATORE_FALLITO), StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException ancora) {
                log.error("Impossibile nemmeno rinominare il marcatore: {}", ancora.toString());
            }
        }
    }
}
