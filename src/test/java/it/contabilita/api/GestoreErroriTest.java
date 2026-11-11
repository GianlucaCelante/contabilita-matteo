package it.contabilita.api;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.RestController;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** {@link GestoreErrori}: ogni errore risponde {@code {"errore": "..."}} con il codice giusto, mai 500. */
class GestoreErroriTest extends ProvaBase {

    private final Logger logger = (Logger) LoggerFactory.getLogger(GestoreErrori.class);
    private final ListAppender<ILoggingEvent> righe = new ListAppender<>();
    private Level livelloDiPrima;

    @BeforeEach
    void ascolta() {
        livelloDiPrima = logger.getLevel();
        logger.setLevel(Level.DEBUG); // per vedere anche le righe a DEBUG: devono essere pulite pure quelle
        righe.start();
        logger.addAppender(righe);
    }

    @AfterEach
    void smetti() {
        logger.detachAppender(righe);
        logger.setLevel(livelloDiPrima);
    }

    private void nessunErroreNelLogENienteACapo() {
        assertThat(righe.list).allSatisfy(e -> {
            assertThat(e.getLevel().isGreaterOrEqual(Level.WARN)).as(e.getFormattedMessage()).isFalse();
            assertThat(e.getThrowableProxy()).isNull();
            assertThat(e.getFormattedMessage()).doesNotContain("\r").doesNotContain("\n").doesNotContain("\u2028");
        });
    }

    @Test
    void unMetodoNonSupportatoSuUnaRottaEsistenteRisponde405() throws Exception {
        mockMvc.perform(patch("/api/fornitori").contentType("application/json").content("{}"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.errore").value("Metodo non ammesso per questo indirizzo."));
    }

    @Test
    void unaRottaApiInesistenteRisponde404ConErroreJson() throws Exception {
        mockMvc.perform(post("/api/rotta-che-non-esiste").contentType("application/json").content("{}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errore").value("Indirizzo non trovato: /api/rotta-che-non-esiste"));
        nessunErroreNelLogENienteACapo();
    }

    // s49: l'indirizzo lo scrive chi chiama: nella risposta e nel log passa da PerLog.pulisci (non piu' di 300 caratteri; a capo
    // e separatori di riga arrivano gia' codificati con il %, quindi non possono cominciare una riga di log finta).
    @Test
    void ilPercorsoDiUnIndirizzoInesistenteTornaPulitoEAccorciato() throws Exception {
        mockMvc.perform(get("/api/non-c-e/{pezzo}", "riga\nfinta\u2028 ERROR"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errore").value("Indirizzo non trovato: /api/non-c-e/riga%0Afinta%E2%80%A8%20ERROR"));
        String lungo = "/api/" + "x".repeat(500);
        mockMvc.perform(get(lungo))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errore").value("Indirizzo non trovato: " + it.contabilita.PerLog.pulisci(lungo)));
        assertThat(it.contabilita.PerLog.pulisci(lungo)).hasSizeLessThan(310).endsWith("…");
        assertThat(righe.list).extracting(ILoggingEvent::getFormattedMessage).contains("indirizzo non trovato: /api/non-c-e/riga%0Afinta%E2%80%A8%20ERROR");
        nessunErroreNelLogENienteACapo();
    }

    @Test
    void unCorpoJsonIlleggibileRisponde400() throws Exception {
        mockMvc.perform(post("/api/fornitori").contentType("application/json").content("{rotto"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errore").value("Richiesta non leggibile: JSON non valido."));
    }

    @Test
    void unEnumSconosciutoNominaIlCampo() throws Exception {
        mockMvc.perform(post("/api/categorie").contentType("application/json").content("{\"nome\":\"A\",\"tipo\":\"BOH\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errore").value("Valore non valido per «tipo»: BOH"));
    }

    // s44: un Content-Type che il servizio non legge e' un errore di chi chiama: 415, non 500, e il valore inventato dal
    // cliente non torna nella risposta ne' finisce nel log a ERROR.
    @Test
    void unContentTypeNonAmmessoRisponde415SenzaRipetereIlValoreDelCliente() throws Exception {
        String corpo = mockMvc.perform(post("/api/fornitori").header("Content-Type", "application/x-inventato-dal-cliente").content("{}"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.errore").value("Tipo di contenuto non ammesso per questo indirizzo."))
                .andReturn().getResponse().getContentAsString();
        assertThat(corpo).doesNotContain("inventato");
        // nemmeno uno che non e' un tipo valido (Spring non riesce nemmeno a leggerlo)
        mockMvc.perform(post("/api/fornitori").header("Content-Type", "questo non è un tipo\u2028FINTA RIGA").content("{}"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.errore").value("Tipo di contenuto non ammesso per questo indirizzo."));
        nessunErroreNelLogENienteACapo();
    }

    @Test
    void unAcceptCheIlServizioNonSaDareRisponde406ConErroreJson() throws Exception {
        mockMvc.perform(get("/api/fornitori").accept("application/pdf"))
                .andExpect(status().isNotAcceptable())
                .andExpect(jsonPath("$.errore").value("Formato della risposta non disponibile per questo indirizzo."));
        nessunErroreNelLogENienteACapo();
    }

    /** Rotte di prova con un parametro e un file obbligatori (nel servizio oggi sono tutti facoltativi). */
    @RestController
    static class ControllerConObbligatori {
        @GetMapping("/api/con-parametro")
        String conParametro(@RequestParam String periodo) {
            return periodo;
        }

        @PostMapping("/api/con-file")
        String conFile(@RequestParam("file") MultipartFile file) {
            return file.getName();
        }
    }

    // Review di s44: un parametro obbligatorio che manca e un caricamento che non e' un caricamento sono errori di chi
    // chiama: 400 in italiano, non il 500 del catch-all, e niente righe a ERROR.
    @Test
    void unParametroObbligatorioMancanteEUnCaricamentoNonValidoRispondono400() throws Exception {
        MockMvc daSolo = MockMvcBuilders.standaloneSetup(new ControllerConObbligatori()).setControllerAdvice(new GestoreErrori()).build();
        daSolo.perform(get("/api/con-parametro"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errore").value("Manca il parametro «periodo»."));
        daSolo.perform(post("/api/con-file").contentType("application/json").content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errore").value("Il caricamento del file non è valido: riprova."));
        nessunErroreNelLogENienteACapo();
    }

    /** Una rotta di prova che fallisce come un caricamento oltre i limiti del multipart (MockMvc quei limiti non li applica). */
    @RestController
    static class ControllerCaricamentoEnorme {
        @PostMapping("/api/enorme")
        String enorme() {
            throw new org.springframework.web.multipart.MaxUploadSizeExceededException(120L * 1024 * 1024);
        }
    }

    // Review di s48: oltre i limiti del multipart il testo vale anche per piu' file e dice il massimo, letto dalla configurazione.
    @Test
    void unCaricamentoOltreILimitiDelMultipartDiceIlMassimoEValeAnchePerPiuFile() throws Exception {
        MockMvc daSolo = MockMvcBuilders.standaloneSetup(new ControllerCaricamentoEnorme()).setControllerAdvice(new GestoreErrori()).build();
        daSolo.perform(post("/api/enorme"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errore").value("Il caricamento è troppo grande (massimo 120 MB per volta): scegli meno file, o file più piccoli, e riprova."));
        MockMvc conAltroLimite = MockMvcBuilders.standaloneSetup(new ControllerCaricamentoEnorme())
                .setControllerAdvice(new GestoreErrori(org.springframework.util.unit.DataSize.ofMegabytes(50))).build();
        conAltroLimite.perform(post("/api/enorme"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errore").value("Il caricamento è troppo grande (massimo 50 MB per volta): scegli meno file, o file più piccoli, e riprova."));
        nessunErroreNelLogENienteACapo();
    }

    @Autowired
    private org.springframework.core.env.Environment ambiente;

    @Test
    void iDueLimitiDelMultipartSonoUgualiCosiIlMassimoDettoEVeroAnchePerUnFileSolo() {
        assertThat(ambiente.getProperty("spring.servlet.multipart.max-file-size")).isEqualTo("120MB");
        assertThat(ambiente.getProperty("spring.servlet.multipart.max-request-size")).isEqualTo("120MB");
    }

    /** Un controller che si rompe con un messaggio che contiene dati del cliente. */
    @RestController
    static class ControllerRotto {
        @GetMapping("/api/rotto")
        String rotto() {
            throw new IllegalStateException("fornitore «Forno Rossi Srl»\r\n2026-01-01 INFO FINTA RIGA\u2028altra",
                    new java.io.IOException("causa con a capo\ndentro"));
        }
    }

    // s44: il 500 non ripete al cliente il messaggio dell'eccezione (puo' contenere dati suoi o dettagli interni): un testo
    // generico, e il dettaglio solo nel log, su righe che il messaggio non puo' spezzare.
    @Test
    void unErroreNonPrevistoRisponde500ConUnMessaggioGenericoEIlDettaglioSoloNelLog() throws Exception {
        MockMvc daSolo = MockMvcBuilders.standaloneSetup(new ControllerRotto()).setControllerAdvice(new GestoreErrori()).build();
        String corpo = daSolo.perform(get("/api/rotto"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.errore").value("Errore interno: riprova. Se continua, riavvia il programma sul computer."))
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(corpo).doesNotContain("Forno Rossi").doesNotContain("FINTA RIGA").doesNotContain("IllegalStateException");

        assertThat(righe.list).hasSize(1);
        ILoggingEvent errore = righe.list.get(0);
        assertThat(errore.getLevel()).isEqualTo(Level.ERROR);
        assertThat(errore.getFormattedMessage()).doesNotContain("\r").doesNotContain("\n").doesNotContain("\u2028");
        // lo stack c'e' (serve a trovare il guasto), con il tipo e il messaggio veri ma senza a capo, anche nella causa
        var stack = errore.getThrowableProxy();
        assertThat(stack).isNotNull();
        assertThat(stack.getStackTraceElementProxyArray()).isNotEmpty();
        assertThat(stack.getStackTraceElementProxyArray()[0].getStackTraceElement().getMethodName()).isEqualTo("rotto");
        assertThat(stack.getMessage()).contains("java.lang.IllegalStateException").contains("Forno Rossi Srl»__2026-01-01 INFO FINTA RIGA_altra");
        assertThat(stack.getCause().getMessage()).isEqualTo("java.io.IOException: causa con a capo_dentro");
    }
}
