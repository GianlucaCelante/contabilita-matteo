package it.contabilita.programma;

import com.fasterxml.jackson.databind.JsonNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** Copie di sicurezza: API, VACUUM INTO, cartelle datate, pulizia, recupero all'avvio. */
class BackupServiceTest extends ProvaBase {

    @Autowired
    private BackupService backup;

    private static final Path PREDEFINITA = CARTELLA_DATI.toAbsolutePath().resolve("copie");

    private Path nuovaCartella() throws Exception {
        return Files.createTempDirectory(CARTELLA_DATI.getParent(), "contabilita-backup-");
    }

    private String json(Path p) throws Exception {
        return this.json.writeValueAsString(this.json.createObjectNode().put("cartella", p.toString()));
    }

    @Test
    void ilProgrammaPartaConLaCartellaPredefinitaENessunaCopia() throws Exception {
        JsonNode p = leggi("/api/programma");
        assertThat(p.get("versione").asText()).isEqualTo("0.1.0");
        assertThat(p.get("cartellaBackup").asText()).isEqualTo(PREDEFINITA.toString());
        assertThat(p.get("cartellaPredefinita").asBoolean()).isTrue();
        assertThat(p.get("ultimoBackup").isNull()).isTrue();
    }

    @Test
    void senzaCartellaConfigurataLaCopiaVaNellaCartellaPredefinita() throws Exception {
        assertThat(PREDEFINITA).doesNotExist();
        JsonNode esito = invia(post("/api/programma/backup"), null, 200);
        Path copia = Path.of(esito.get("cartella").asText());
        assertThat(copia.getParent()).isEqualTo(PREDEFINITA);
        assertThat(copia.resolve("contabilita.db")).exists();
        assertThat(leggi("/api/programma/copie")).hasSize(1);
        assertThat(leggi("/api/programma").get("ultimoBackup").get("cartella").asText()).isEqualTo(copia.toString());
    }

    @Test
    void laCopiaNonContieneLaCartellaDelleCopie() throws Exception {
        invia(post("/api/programma/backup"), null, 200);
        JsonNode esito = invia(post("/api/programma/backup"), null, 200);
        assertThat(Path.of(esito.get("cartella").asText()).resolve("copie")).doesNotExist();
    }

    @Test
    void ilRecuperoAllAvvioUsaLaCartellaPredefinita() throws Exception {
        backup.controllaRecuperoAllAvvio();
        try (Stream<Path> s = Files.list(PREDEFINITA)) {
            assertThat(s.count()).isEqualTo(1);
        }
    }

    @Test
    void tornareAlPredefinitoConNullOVuoto() throws Exception {
        Path cartella = nuovaCartella();
        JsonNode stato = invia(put("/api/programma/backup"), json(cartella), 200);
        assertThat(stato.get("cartellaPredefinita").asBoolean()).isFalse();
        assertThat(leggi("/api/programma").get("cartellaBackup").asText()).isEqualTo(cartella.toString());
        JsonNode n = invia(put("/api/programma/backup"), "{\"cartella\":null}", 200);
        assertThat(n.get("cartellaPredefinita").asBoolean()).isTrue();
        assertThat(n.get("cartellaBackup").asText()).isEqualTo(PREDEFINITA.toString());
        invia(put("/api/programma/backup"), json(cartella), 200);
        JsonNode v = invia(put("/api/programma/backup"), "{\"cartella\":\"  \"}", 200);
        assertThat(v.get("cartellaPredefinita").asBoolean()).isTrue();
    }

    @Test
    void unaCartellaNuovaMaCreabileVieneCreataEIlFileDiProvaSparisce() throws Exception {
        Path nuova = nuovaCartella().resolve("sotto").resolve("copie-mie");
        JsonNode stato = invia(put("/api/programma/backup"), json(nuova), 200);
        assertThat(stato.get("cartellaBackup").asText()).isEqualTo(nuova.toString());
        assertThat(nuova).isDirectory();
        try (Stream<Path> s = Files.list(nuova)) {
            assertThat(s.count()).isZero();
        }
    }

    @Test
    void unaCartellaNonCreabileDa400ConMessaggioInItaliano() throws Exception {
        Path file = Files.createTempFile(CARTELLA_DATI.getParent(), "contabilita-file-", ".txt");
        JsonNode r = invia(put("/api/programma/backup"), json(file.resolve("sotto")), 400);
        assertThat(r.get("errore").asText()).isNotBlank();
    }

    @Test
    void unaCartellaDentroIDatiDa400TranneLaPredefinita() throws Exception {
        JsonNode r = invia(put("/api/programma/backup"), json(CARTELLA_DATI.resolve("altro")), 400);
        assertThat(r.get("errore").asText()).isEqualTo("La cartella delle copie non può stare dentro i dati, tranne quella predefinita.");
        invia(put("/api/programma/backup"), json(CARTELLA_DATI.resolve("allegati")), 400);
        invia(put("/api/programma/backup"), json(CARTELLA_DATI), 400);
        JsonNode ok = invia(put("/api/programma/backup"), json(PREDEFINITA), 200);
        assertThat(ok.get("cartellaPredefinita").asBoolean()).isTrue();
    }

    @Test
    void cartellaNonValidaDa400() throws Exception {
        Path file = Files.createTempFile(CARTELLA_DATI.getParent(), "contabilita-file-", ".txt");
        errore(put("/api/programma/backup"), json(file.resolve("sotto")), 400);
        errore(put("/api/programma/backup"), json(file), 400);
        errore(put("/api/programma/backup"), "{\"cartella\":\"relativa\"}", 400);
        assertThat(leggi("/api/programma").get("cartellaPredefinita").asBoolean()).isTrue();
    }

    @Test
    void laCopiaContieneIDatiAttualiInUnaSottocartellaDatata() throws Exception {
        crea(movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 4242));
        Path cartella = nuovaCartella();
        JsonNode stato = invia(put("/api/programma/backup"), json(cartella), 200);
        assertThat(stato.get("cartellaBackup").asText()).isEqualTo(cartella.toString());

        JsonNode esito = invia(post("/api/programma/backup"), null, 200);
        Path copia = Path.of(esito.get("cartella").asText());
        assertThat(copia.getParent()).isEqualTo(cartella);
        assertThat(copia.getFileName().toString()).matches("\\d{4}-\\d{2}-\\d{2}_\\d{6}(-\\d+)?");
        Path file = copia.resolve("contabilita.db");
        assertThat(file).exists();

        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file);
             Statement s = c.createStatement();
             ResultSet r = s.executeQuery("SELECT importo_cent FROM movimento")) {
            assertThat(r.next()).isTrue();
            assertThat(r.getLong(1)).isEqualTo(4242);
            assertThat(r.next()).isFalse();
        }

        JsonNode p = leggi("/api/programma");
        assertThat(p.get("ultimoBackup").get("cartella").asText()).isEqualTo(copia.toString());
        assertThat(p.get("ultimoBackup").get("quando").asText()).isNotBlank();

        // spegnere le copie
        JsonNode spento = invia(put("/api/programma/backup"), "{\"cartella\":null}", 200);
        assertThat(spento.get("cartellaBackup").asText()).isEqualTo(PREDEFINITA.toString());
        assertThat(spento.get("cartellaPredefinita").asBoolean()).isTrue();
    }

    @Test
    void dueCopieRavvicinateNonSiPestanoEUnaCopiaInCorsoDa409() throws Exception {
        Path cartella = nuovaCartella();
        invia(put("/api/programma/backup"), json(cartella), 200);
        invia(post("/api/programma/backup"), null, 200);
        invia(post("/api/programma/backup"), null, 200);
        try (Stream<Path> s = Files.list(cartella)) {
            assertThat(s.count()).isEqualTo(2);
        }
        backup.simulaCopiaInCorsoPerTest(true);
        try {
            errore(post("/api/programma/backup"), null, 409);
        } finally {
            backup.simulaCopiaInCorsoPerTest(false);
        }
    }

    @Test
    void laSecondaCopiaNonRicopiaGliAllegatiGiaCopiatiMaRestaCompleta() throws Exception {
        Path allegati = CARTELLA_DATI.toAbsolutePath().resolve("allegati");
        Files.createDirectories(allegati);
        Path vecchio = Files.writeString(allegati.resolve("prova-incrementale-1.jpg"), "uno");
        Path cartella = nuovaCartella();
        try {
            invia(put("/api/programma/backup"), json(cartella), 200);
            Path prima = Path.of(invia(post("/api/programma/backup"), null, 200).get("cartella").asText());
            Thread.sleep(1100); // il nome della copia ha la precisione del secondo
            Path nuovo = Files.writeString(allegati.resolve("prova-incrementale-2.jpg"), "due");
            Path seconda = Path.of(invia(post("/api/programma/backup"), null, 200).get("cartella").asText());

            assertThat(seconda.resolve("allegati/prova-incrementale-1.jpg")).hasContent("uno");
            assertThat(seconda.resolve("allegati/prova-incrementale-2.jpg")).hasContent("due");
            assertThat(prima.resolve("allegati/prova-incrementale-2.jpg")).doesNotExist();
            assertThat(Files.isSameFile(seconda.resolve("allegati/prova-incrementale-1.jpg"),
                    prima.resolve("allegati/prova-incrementale-1.jpg"))).isTrue();
            assertThat(Files.isSameFile(seconda.resolve("allegati/prova-incrementale-2.jpg"), nuovo)).isFalse();

            CopiaCartelle.elimina(prima);
            assertThat(seconda.resolve("allegati/prova-incrementale-1.jpg")).hasContent("uno");
        } finally {
            Files.deleteIfExists(vecchio);
            Files.deleteIfExists(allegati.resolve("prova-incrementale-2.jpg"));
        }
    }

    @Test
    void siTengonoSoloLeUltimeDieciCopieESiLasciaStareLAltro() throws Exception {
        Path cartella = nuovaCartella();
        for (int i = 1; i <= 12; i++) {
            Files.createDirectories(cartella.resolve(String.format("2025-01-%02d_030000", i)));
        }
        Files.createDirectories(cartella.resolve("foto-di-famiglia"));
        Files.writeString(cartella.resolve("appunti.txt"), "ciao");
        invia(put("/api/programma/backup"), json(cartella), 200);
        invia(post("/api/programma/backup"), null, 200);
        try (Stream<Path> s = Files.list(cartella)) {
            List<String> nomi = s.map(p -> p.getFileName().toString()).sorted().toList();
            assertThat(nomi).contains("foto-di-famiglia", "appunti.txt");
            assertThat(nomi.stream().filter(n -> n.matches("\\d{4}-.*")).count()).isEqualTo(10);
            assertThat(nomi).doesNotContain("2025-01-01_030000", "2025-01-02_030000", "2025-01-03_030000");
        }
    }

    @Test
    void ilCriterioDelRecuperoAllAvvio() {
        LocalDateTime adesso = LocalDateTime.of(2026, 3, 10, 14, 0);
        assertThat(BackupService.backupDovuto(null, adesso)).isTrue();
        assertThat(BackupService.backupDovuto(LocalDateTime.of(2026, 3, 10, 3, 0, 1), adesso)).isFalse();
        assertThat(BackupService.backupDovuto(LocalDateTime.of(2026, 3, 9, 20, 0), adesso)).isTrue();
        // prima delle 3 conta ancora il giro di ieri
        LocalDateTime alle2 = LocalDateTime.of(2026, 3, 10, 2, 0);
        assertThat(BackupService.backupDovuto(LocalDateTime.of(2026, 3, 9, 3, 30), alle2)).isFalse();
        assertThat(BackupService.backupDovuto(LocalDateTime.of(2026, 3, 8, 3, 30), alle2)).isTrue();
    }

    @Test
    void ilRecuperoAllAvvioFaLaCopiaMancataEPoiNonLaRipete() throws Exception {
        Path cartella = nuovaCartella();
        invia(put("/api/programma/backup"), json(cartella), 200);
        backup.controllaRecuperoAllAvvio();
        backup.controllaRecuperoAllAvvio();
        try (Stream<Path> s = Files.list(cartella)) {
            assertThat(s.count()).isEqualTo(1);
        }
    }

    @Test
    void iMessaggiDErroreSonoInItaliano() {
        assertThat(BackupService.messaggioErrore(new java.nio.file.AccessDeniedException("x"))).contains("Permessi");
        assertThat(BackupService.messaggioErrore(new java.sql.SQLException("[SQLITE_ERROR]"))).doesNotContain("SQLITE");
        assertThat(BackupService.messaggioErrore(new java.io.IOException("x"))).contains("Errore di scrittura");
    }
}
