package it.contabilita.programma;

import com.fasterxml.jackson.databind.JsonNode;
import it.contabilita.ConfigurazioneProva;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** Ripristino da copia: elenco delle copie, validazione, copia di sicurezza, marcatore, uscita con codice 75. */
class RipristinoApiTest extends ProvaBase {

    @Autowired
    private ConfigurazioneProva.UscitaDiProva uscita;

    private Path marcatore() {
        return CARTELLA_DATI.resolve("ripristino-in-attesa.json");
    }

    @BeforeEach
    @AfterEach
    void pulisci() throws Exception {
        Files.deleteIfExists(marcatore());
        uscita.chiamate().clear();
    }

    private Path nuovaCartella() throws Exception {
        Path cartella = Files.createTempDirectory(CARTELLA_DATI.getParent(), "contabilita-ripristino-");
        invia(put("/api/programma/backup"),
                this.json.writeValueAsString(this.json.createObjectNode().put("cartella", cartella.toString())), 200);
        return cartella;
    }

    /** Una copia vera: VACUUM INTO del database in uso. */
    private Path copiaVera(Path cartella, String nome) throws Exception {
        Path dir = Files.createDirectories(cartella.resolve(nome));
        jdbc.execute("VACUUM INTO '" + dir.resolve("contabilita.db") + "'");
        return dir;
    }

    private Path copiaConSql(Path cartella, String nome, String... istruzioni) throws Exception {
        Path dir = Files.createDirectories(cartella.resolve(nome));
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + dir.resolve("contabilita.db"));
             Statement s = c.createStatement()) {
            for (String i : istruzioni) {
                s.execute(i);
            }
        }
        return dir;
    }

    private List<String> nomi(Path cartella) throws Exception {
        try (Stream<Path> s = Files.list(cartella)) {
            return s.map(p -> p.getFileName().toString()).sorted().toList();
        }
    }

    private String corpoRipristino(String copia) throws Exception {
        return json.writeValueAsString(json.createObjectNode().put("copia", copia));
    }

    private long contaMovimenti(Path file) throws Exception {
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file);
             Statement s = c.createStatement();
             var r = s.executeQuery("SELECT count(*) FROM movimento")) {
            r.next();
            return r.getLong(1);
        }
    }

    // ---- elenco ----

    @Test
    void conLaCartellaPredefinitaAppenaCreataLElencoEVuoto() throws Exception {
        JsonNode elenco = leggi("/api/programma/copie");
        assertThat(elenco.isArray()).isTrue();
        assertThat(elenco).isEmpty();
    }

    @Test
    void lElencoVaDallaPiuRecenteEIgnoraLeCartelleEstranee() throws Exception {
        crea(movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 100));
        Path cartella = nuovaCartella();
        copiaVera(cartella, "2026-01-05_030000");
        copiaVera(cartella, "2026-02-01_030000-2");
        copiaVera(cartella, "2026-02-01_030000");
        copiaVera(cartella, "prima-del-ripristino-2026-02-10_101500");
        Files.createDirectories(cartella.resolve("2026-03-01_030000")); // senza database
        Files.createDirectories(cartella.resolve("foto-di-famiglia"));
        Files.writeString(cartella.resolve("2026-04-01_030000"), "sono un file"); // non e' una cartella
        Files.writeString(cartella.resolve("appunti.txt"), "ciao");

        JsonNode elenco = leggi("/api/programma/copie");
        List<String> nomiElenco = new ArrayList<>();
        elenco.forEach(n -> nomiElenco.add(n.get("nome").asText()));
        assertThat(nomiElenco).containsExactly(
                "prima-del-ripristino-2026-02-10_101500",
                "2026-02-01_030000-2",
                "2026-02-01_030000",
                "2026-01-05_030000");
        JsonNode ultima = elenco.get(3);
        assertThat(ultima.get("quando").asText()).isEqualTo("2026-01-05T03:00:00");
        assertThat(ultima.get("dimensioneByte").asLong())
                .isEqualTo(Files.size(cartella.resolve("2026-01-05_030000").resolve("contabilita.db")))
                .isPositive();
    }

    // ---- rifiuti ----

    @Test
    void nomiPericolosiOInesistentiSonoRifiutatiSenzaEffetti() throws Exception {
        Path cartella = nuovaCartella();
        copiaVera(cartella, "2026-01-05_030000");
        List<String> prima = nomi(cartella);

        for (String nome : List.of("..", "../x", "a/b", "a\\b", "..\\..\\Windows", "C:\\Windows", "/etc", ".", "", " ",
                "2026-01-05_030000/..")) {
            errore(post("/api/programma/ripristina"), corpoRipristino(nome), 400);
        }
        errore(post("/api/programma/ripristina"), "{}", 400);
        errore(post("/api/programma/ripristina"), corpoRipristino("2020-01-01_000000"), 404);
        errore(post("/api/programma/ripristina"), corpoRipristino("foto-di-famiglia"), 404);

        assertThat(nomi(cartella)).isEqualTo(prima);
        assertThat(marcatore()).doesNotExist();
        assertThat(uscita.chiamate()).isEmpty();
    }

    @Test
    void unaCopiaCorrottaOSenzaLeTabelleAttese() throws Exception {
        Path cartella = nuovaCartella();
        Path corrotta = Files.createDirectories(cartella.resolve("2026-01-01_030000"));
        Files.writeString(corrotta.resolve("contabilita.db"), "questo non e' un database sqlite ".repeat(300));
        copiaConSql(cartella, "2026-01-02_030000", "CREATE TABLE altro (x INTEGER)");
        copiaConSql(cartella, "2026-01-03_030000", "CREATE TABLE movimento (id INTEGER)"); // manca databasechangelog
        List<String> prima = nomi(cartella);

        for (String nome : prima) {
            errore(post("/api/programma/ripristina"), corpoRipristino(nome), 400);
        }
        assertThat(nomi(cartella)).isEqualTo(prima);
        assertThat(marcatore()).doesNotExist();
        assertThat(uscita.chiamate()).isEmpty();
    }

    @Test
    void unaCopiaDiUnoSchemaPiuRecenteDellAppESiRifiuta() throws Exception {
        Path cartella = nuovaCartella();
        Path dir = copiaVera(cartella, "2026-01-05_030000");
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + dir.resolve("contabilita.db"));
             Statement s = c.createStatement()) {
            s.execute("INSERT INTO DATABASECHANGELOG (ID, AUTHOR, FILENAME, DATEEXECUTED, ORDEREXECUTED, EXECTYPE, MD5SUM) "
                    + "VALUES ('99-dal-futuro', 'x', 'v9.yaml', '2030-01-01', 99, 'EXECUTED', 'x')");
        }
        JsonNode r = errore(post("/api/programma/ripristina"), corpoRipristino("2026-01-05_030000"), 400);
        assertThat(r.get("errore").asText()).containsIgnoringCase("più recente");
        assertThat(marcatore()).doesNotExist();
        assertThat(uscita.chiamate()).isEmpty();
    }

    @Test
    void unRipristinoGiaInAttesaDa409() throws Exception {
        Path cartella = nuovaCartella();
        copiaVera(cartella, "2026-01-05_030000");
        Files.writeString(marcatore(), "{}");
        errore(post("/api/programma/ripristina"), corpoRipristino("2026-01-05_030000"), 409);
        assertThat(uscita.chiamate()).isEmpty();
    }

    @Test
    void ilRipristinoDallaCartellaPredefinitaFunzionaEFaLaCopiaDiSicurezzaLi() throws Exception {
        crea(movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 100));
        Path predefinita = CARTELLA_DATI.toAbsolutePath().resolve("copie");
        copiaVera(predefinita, "2026-01-05_030000");
        assertThat(leggi("/api/programma/copie")).hasSize(1);
        JsonNode r = invia(post("/api/programma/ripristina"), corpoRipristino("2026-01-05_030000"), 202);
        assertThat(predefinita.resolve(r.get("copiaDiSicurezza").asText()).resolve("contabilita.db")).exists();
        assertThat(uscita.chiamate()).containsExactly(75);
    }

    // ---- il caso buono ----

    @Test
    void unRipristinoValidoFaLaCopiaDiSicurezzaScriveIlMarcatoreEEsceConCodice75() throws Exception {
        crea(movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 100));
        Path cartella = nuovaCartella();
        Path copia = copiaVera(cartella, "2026-01-05_030000");
        crea(movimento("2026-03-11", "RICAVO", "RICAVO_EXTRA", 200)); // dopo la copia

        var risposta = mockMvc.perform(post("/api/programma/ripristina").contentType("application/json")
                .content(corpoRipristino("2026-01-05_030000")));
        assertThat(risposta.andReturn().getResponse().getStatus()).isEqualTo(202);
        JsonNode corpo = corpo(risposta);
        assertThat(corpo.get("riavvio").asBoolean()).isTrue();
        String sicurezza = corpo.get("copiaDiSicurezza").asText();
        assertThat(sicurezza).matches("prima-del-ripristino-\\d{4}-\\d{2}-\\d{2}_\\d{6}(-\\d+)?");

        // la copia di sicurezza ha i dati ATTUALI (due movimenti)
        Path fileSicurezza = cartella.resolve(sicurezza).resolve("contabilita.db");
        assertThat(fileSicurezza).exists();
        assertThat(contaMovimenti(fileSicurezza)).isEqualTo(2);

        // il marcatore punta alla copia scelta (percorso assoluto)
        JsonNode m = json.readTree(Files.readString(marcatore()));
        assertThat(Path.of(m.get("copia").asText())).isAbsolute().isEqualTo(copia.resolve("contabilita.db"));
        assertThat(m.get("copiaDiSicurezza").asText()).isEqualTo(sicurezza);
        assertThat(m.get("richiestoIl").asText()).isNotBlank();

        // uscita richiesta una volta sola, con 75
        assertThat(uscita.chiamate()).containsExactly(75);

        // il database in uso non e' stato toccato
        assertThat(jdbc.queryForObject("SELECT count(*) FROM movimento", Integer.class)).isEqualTo(2);
    }

    @Test
    void roundTripBackupModificaRipristinoApplicato() throws Exception {
        crea(movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 100));
        Path cartella = nuovaCartella();
        String nomeCopia = Path.of(invia(post("/api/programma/backup"), null, 200).get("cartella").asText())
                .getFileName().toString();
        crea(movimento("2026-03-11", "RICAVO", "RICAVO_EXTRA", 200));

        mockMvc.perform(post("/api/programma/ripristina").contentType("application/json").content(corpoRipristino(nomeCopia)))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isAccepted());

        // "riavvio": una cartella dati a parte con i dati attuali e il marcatore appena scritto
        Path dati = Files.createTempDirectory(CARTELLA_DATI.getParent(), "contabilita-riavvio-");
        jdbc.execute("VACUUM INTO '" + dati.resolve("contabilita.db") + "'");
        Files.move(marcatore(), dati.resolve("ripristino-in-attesa.json"));
        assertThat(contaMovimenti(dati.resolve("contabilita.db"))).isEqualTo(2);

        assertThat(RipristinoInSospeso.applica(dati)).isEqualTo(RipristinoInSospeso.Esito.APPLICATO);

        assertThat(contaMovimenti(dati.resolve("contabilita.db"))).isEqualTo(1);
        assertThat(dati.resolve("ripristino-in-attesa.json")).doesNotExist();
        assertThat(cartella).isDirectory();
    }

    // ---- documentazione eseguibile della dipendenza dal codice 75 ----

    @Test
    void ilServizioWinSWRiavviaDopoUnUscitaNonZero() throws Exception {
        Path xml = Path.of("installer", "Contabilita.xml");
        assertThat(xml).as("installer/Contabilita.xml").exists();
        String testo = Files.readString(xml);
        // il ripristino esce con 75 (non zero): WinSW riavvia solo con <onfailure action="restart">
        assertThat(testo).containsPattern("<onfailure\\s+action=\"restart\"");
    }
}
