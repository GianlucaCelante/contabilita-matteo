package it.contabilita.programma;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/** Il ripristino all'avvio rimette a posto gli allegati SOLO se la copia li contiene. */
class RipristinoAllegatiTest {

    @TempDir
    Path radice;

    private Path dati;
    private Path copiaDb;

    private void preparaDatabase(Path file) throws Exception {
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file);
             Statement s = c.createStatement()) {
            s.execute("CREATE TABLE movimento (id INTEGER PRIMARY KEY, importo_cent INTEGER)");
            s.execute("CREATE TABLE databasechangelog (id TEXT)");
        }
    }

    private void prepara(boolean conAllegatiNellaCopia) throws Exception {
        dati = Files.createDirectories(radice.resolve("dati"));
        preparaDatabase(dati.resolve("contabilita.db"));
        Files.createDirectories(dati.resolve("allegati"));
        Files.writeString(dati.resolve("allegati").resolve("attuale.jpg"), "attuale");
        Path copia = Files.createDirectories(radice.resolve("copia"));
        copiaDb = copia.resolve("contabilita.db");
        preparaDatabase(copiaDb);
        if (conAllegatiNellaCopia) {
            Files.createDirectories(copia.resolve("allegati").resolve("sotto"));
            Files.writeString(copia.resolve("allegati").resolve("dalla-copia.png"), "copia");
            Files.writeString(copia.resolve("allegati").resolve("sotto").resolve("x.pdf"), "x");
        }
    }

    private void marcatore(Map<String, Object> extra) throws Exception {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("copia", copiaDb.toString());
        m.put("richiestoIl", "2026-01-01T10:00:00");
        m.put("copiaDiSicurezza", "x");
        m.putAll(extra);
        new ObjectMapper().writeValue(dati.resolve("ripristino-in-attesa.json").toFile(), m);
    }

    private long contaFile(Path dir) throws Exception {
        try (Stream<Path> s = Files.walk(dir)) {
            return s.filter(Files::isRegularFile).count();
        }
    }

    @Test
    void conAllegatiNellaCopiaLaCartellaVieneSostituitaSenzaResidui() throws Exception {
        prepara(true);
        marcatore(Map.of("allegati", radice.resolve("copia").resolve("allegati").toString()));

        assertThat(RipristinoInSospeso.applica(dati)).isEqualTo(RipristinoInSospeso.Esito.APPLICATO);

        assertThat(dati.resolve("allegati").resolve("dalla-copia.png")).hasContent("copia");
        assertThat(dati.resolve("allegati").resolve("sotto").resolve("x.pdf")).hasContent("x");
        assertThat(dati.resolve("allegati").resolve("attuale.jpg")).doesNotExist();
        assertThat(contaFile(dati.resolve("allegati"))).isEqualTo(2);
        assertThat(radice.resolve("copia").resolve("allegati").resolve("dalla-copia.png")).exists(); // la copia resta
        assertThat(dati.resolve("ripristino-in-attesa.json")).doesNotExist();
        try (Stream<Path> s = Files.list(dati)) {
            assertThat(s.map(p -> p.getFileName().toString())).containsExactlyInAnyOrder("contabilita.db", "allegati");
        }
    }

    @Test
    void senzaAllegatiNellaCopiaQuelliAttualiRestanoDovesono() throws Exception {
        prepara(false);
        marcatore(Map.of());

        assertThat(RipristinoInSospeso.applica(dati)).isEqualTo(RipristinoInSospeso.Esito.APPLICATO);

        assertThat(dati.resolve("allegati").resolve("attuale.jpg")).hasContent("attuale");
    }

    @Test
    void ilRipristinoRipetutoDopoUnaMorteAMetaFunzionaEPulisceIResidui() throws Exception {
        prepara(true);
        // residui di un tentativo interrotto
        Files.createDirectories(dati.resolve("allegati.ripristino.tmp"));
        Files.writeString(dati.resolve("allegati.ripristino.tmp").resolve("mezzo.bin"), "mezzo");
        Files.createDirectories(dati.resolve("allegati.vecchi.tmp"));
        marcatore(Map.of("allegati", radice.resolve("copia").resolve("allegati").toString()));

        assertThat(RipristinoInSospeso.applica(dati)).isEqualTo(RipristinoInSospeso.Esito.APPLICATO);

        assertThat(contaFile(dati.resolve("allegati"))).isEqualTo(2);
        assertThat(dati.resolve("allegati.ripristino.tmp")).doesNotExist();
        assertThat(dati.resolve("allegati.vecchi.tmp")).doesNotExist();
    }

    @Test
    void seGliAllegatiDellaCopiaSonoSparitiIlDatabaseRestauratoResteValidoEIlProblemaESegnalato() throws Exception {
        prepara(false);
        marcatore(Map.of("allegati", radice.resolve("copia").resolve("allegati-spariti").toString()));

        assertThat(RipristinoInSospeso.applica(dati)).isEqualTo(RipristinoInSospeso.Esito.APPLICATO);

        VerificaCopia.controlla(dati.resolve("contabilita.db")); // database valido
        assertThat(dati.resolve("allegati").resolve("attuale.jpg")).hasContent("attuale"); // allegati attuali intatti
        assertThat(dati.resolve("ripristino-in-attesa.json")).doesNotExist();
        assertThat(dati.resolve("ripristino-fallito.json")).doesNotExist();
        assertThat(dati.resolve("ripristino-allegati-falliti.json")).exists();
        assertThat(Files.readString(dati.resolve("ripristino-allegati-falliti.json"))).contains("motivo");
    }
}
