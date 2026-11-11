package it.contabilita.programma;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * s43: cartelle e percorsi li sceglie il cliente (cartella delle copie, nome di una copia, percorsi nel marcatore del
 * ripristino) e finiscono nel log del pacchetto {@code programma}: ci arrivano puliti da {@code PerLog.pulisci}, come i nomi
 * dei file dell'importazione ({@code ImportaLogTest}). Un nome di cartella non puo' avere un a capo su Windows, ma un
 * separatore di riga Unicode (U+2028) o un cambio di direzione del testo (U+202E) si': qui si usano quelli.
 */
class ProgrammaLogTest extends ProvaBase {

    /** U+2028, separatore di riga: chi legge il log lo vede come un a capo. */
    private static final String A_CAPO = " ";
    /** U+202E, da destra a sinistra: fa leggere il resto della riga al contrario. */
    private static final String AL_CONTRARIO = "‮";

    private final Logger logger = (Logger) LoggerFactory.getLogger("it.contabilita.programma");
    private final ListAppender<ILoggingEvent> righe = new ListAppender<>();

    @BeforeEach
    void ascolta() {
        righe.start();
        logger.addAppender(righe);
    }

    @AfterEach
    void smetti() {
        logger.detachAppender(righe);
    }

    /** Tutto il testo che un evento porta nel log: il messaggio e, se c'e' lo stack, i messaggi dell'eccezione e delle cause. */
    private static String testo(ILoggingEvent evento) {
        StringBuilder s = new StringBuilder(evento.getFormattedMessage());
        for (IThrowableProxy t = evento.getThrowableProxy(); t != null; t = t.getCause()) {
            s.append(" | ").append(t.getClassName()).append(": ").append(t.getMessage());
        }
        return s.toString();
    }

    private List<String> scritte() {
        return righe.list.stream().map(ProgrammaLogTest::testo).toList();
    }

    private static void senzaCaratteriPericolosi(List<String> scritte) {
        assertThat(scritte).isNotEmpty().allSatisfy(riga -> assertThat(riga)
                .doesNotContain(A_CAPO).doesNotContain(AL_CONTRARIO).doesNotContain("\r").doesNotContain("\n"));
    }

    @Test
    void laCartellaDelleCopieSceltaDalClienteArrivaPulitaNelLog() throws Exception {
        Path radice = Files.createTempDirectory(CARTELLA_DATI.getParent(), "contabilita-log-");
        Path scelta = radice.resolve("copie" + A_CAPO + "2026-01-01 INFO FINTA RIGA" + AL_CONTRARIO);
        invia(put("/api/programma/backup"), json.createObjectNode().put("cartella", scelta.toString()), 200);
        JsonNode esito = invia(post("/api/programma/backup"), null, 200);
        assertThat(esito.get("cartella").asText()).startsWith(scelta.toString()); // nella risposta resta com'e'

        List<String> scritte = scritte();
        senzaCaratteriPericolosi(scritte);
        assertThat(scritte).anySatisfy(riga -> assertThat(riga)
                .startsWith("Copia di sicurezza riuscita in ").contains("copie_2026-01-01 INFO FINTA RIGA_"));
    }

    @Test
    void ilRipristinoRichiestoScriveNelLogIlNomeDellaCopiaPulito() throws Exception {
        invia(post("/api/programma/backup"), null, 200);
        String nome = invia(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/programma/copie"), null, 200)
                .get(0).get("nome").asText();
        invia(post("/api/programma/ripristina"), json.createObjectNode().put("copia", nome), 202);
        Files.deleteIfExists(CARTELLA_DATI.resolve(RipristinoInSospeso.MARCATORE)); // non deve restare per gli altri test
        List<String> scritte = scritte();
        senzaCaratteriPericolosi(scritte);
        assertThat(scritte).anySatisfy(riga -> assertThat(riga).startsWith("Ripristino richiesto dalla copia " + nome));
    }

    @Test
    void ilPercorsoNelMarcatoreDelRipristinoArrivaPulitoNelLogAncheNelloStack() throws Exception {
        Path dati = Files.createTempDirectory(CARTELLA_DATI.getParent(), "contabilita-log-dati-");
        Path copia = dati.resolve("non-esiste" + A_CAPO + "2026-01-01 INFO FINTA RIGA" + AL_CONTRARIO).resolve("contabilita.db");
        new ObjectMapper().writeValue(dati.resolve(RipristinoInSospeso.MARCATORE).toFile(),
                Map.of("copia", copia.toString(), "richiestoIl", "2026-01-01T10:00:00", "copiaDiSicurezza", "x" + A_CAPO + "y"));

        assertThat(RipristinoInSospeso.applica(dati)).isEqualTo(RipristinoInSospeso.Esito.FALLITO);

        List<ILoggingEvent> errori = righe.list.stream().filter(e -> e.getLevel() == Level.ERROR).toList();
        assertThat(errori).hasSize(1);
        ILoggingEvent errore = errori.get(0);
        assertThat(errore.getFormattedMessage()).startsWith("Ripristino NON applicato").contains("non-esiste_2026-01-01 INFO FINTA RIGA_");
        // lo stack resta (serve a capire), ma il messaggio dell'eccezione e' pulito anche li'
        assertThat(errore.getThrowableProxy()).isNotNull();
        assertThat(errore.getThrowableProxy().getStackTraceElementProxyArray()).isNotEmpty();
        assertThat(errore.getThrowableProxy().getMessage()).contains("java.io.IOException").contains("non-esiste_2026-01-01 INFO FINTA RIGA_");
        senzaCaratteriPericolosi(scritte());
        // nel file del fallimento il motivo resta quello vero: e' un JSON, non una riga di log
        JsonNode fallito = new ObjectMapper().readTree(dati.resolve(RipristinoInSospeso.MARCATORE_FALLITO).toFile());
        assertThat(fallito.get("motivo").asText()).contains(A_CAPO);
    }
}
