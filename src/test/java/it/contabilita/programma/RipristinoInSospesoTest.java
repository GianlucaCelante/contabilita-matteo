package it.contabilita.programma;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Il ripristino applicato all'avvio, prima di Spring: nessun contesto, solo file e sqlite-jdbc. */
class RipristinoInSospesoTest {

    @TempDir
    Path radice;

    private Path dati() throws Exception {
        return Files.createDirectories(radice.resolve("dati"));
    }

    private void creaDatabase(Path file, long importo) throws Exception {
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file);
             Statement s = c.createStatement()) {
            s.execute("CREATE TABLE movimento (id INTEGER PRIMARY KEY, importo_cent INTEGER)");
            s.execute("CREATE TABLE databasechangelog (id TEXT)");
            s.execute("INSERT INTO movimento (importo_cent) VALUES (" + importo + ")");
        }
    }

    private long leggiImporto(Path file) throws Exception {
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file);
             Statement s = c.createStatement();
             ResultSet r = s.executeQuery("SELECT importo_cent FROM movimento")) {
            assertThat(r.next()).isTrue();
            long v = r.getLong(1);
            assertThat(r.next()).isFalse();
            return v;
        }
    }

    private void scriviMarcatore(Path dati, Path copia) throws Exception {
        new ObjectMapper().writeValue(dati.resolve("ripristino-in-attesa.json").toFile(),
                Map.of("copia", copia.toString(), "richiestoIl", "2026-01-01T10:00:00", "copiaDiSicurezza", "x"));
    }

    @Test
    void conUnaCopiaValidaIlDatabaseDiventaLaCopiaESiPulisceTutto() throws Exception {
        Path dati = dati();
        Path db = dati.resolve("contabilita.db");
        creaDatabase(db, 111);
        Files.writeString(dati.resolve("contabilita.db-wal"), "residuo");
        Files.writeString(dati.resolve("contabilita.db-shm"), "residuo");
        Path copia = radice.resolve("copia").resolve("contabilita.db");
        Files.createDirectories(copia.getParent());
        creaDatabase(copia, 222);
        scriviMarcatore(dati, copia);

        assertThat(RipristinoInSospeso.applica(dati)).isEqualTo(RipristinoInSospeso.Esito.APPLICATO);

        assertThat(leggiImporto(db)).isEqualTo(222);
        assertThat(dati.resolve("contabilita.db-wal")).doesNotExist();
        assertThat(dati.resolve("contabilita.db-shm")).doesNotExist();
        assertThat(dati.resolve("ripristino-in-attesa.json")).doesNotExist();
        assertThat(dati.resolve("ripristino-fallito.json")).doesNotExist();
        assertThat(copia).exists(); // la copia originale resta
        try (var s = Files.list(dati)) {
            assertThat(s.map(p -> p.getFileName().toString())).containsExactly("contabilita.db"); // nessun temporaneo
        }
    }

    @Test
    void conLaCopiaSparitaIlDatabaseRestaELasciaIlMarcatoreFallito() throws Exception {
        Path dati = dati();
        Path db = dati.resolve("contabilita.db");
        creaDatabase(db, 111);
        scriviMarcatore(dati, radice.resolve("non-esiste").resolve("contabilita.db"));

        assertThat(RipristinoInSospeso.applica(dati)).isEqualTo(RipristinoInSospeso.Esito.FALLITO);

        assertThat(leggiImporto(db)).isEqualTo(111);
        assertThat(dati.resolve("ripristino-in-attesa.json")).doesNotExist();
        Path fallito = dati.resolve("ripristino-fallito.json");
        assertThat(fallito).exists();
        assertThat(new ObjectMapper().readTree(fallito.toFile()).get("motivo").asText()).isNotBlank();
    }

    @Test
    void conUnaCopiaCorrottaIlDatabaseResta() throws Exception {
        Path dati = dati();
        Path db = dati.resolve("contabilita.db");
        creaDatabase(db, 111);
        Path copia = radice.resolve("copia.db");
        Files.writeString(copia, "non sono un database ".repeat(500));
        scriviMarcatore(dati, copia);

        assertThat(RipristinoInSospeso.applica(dati)).isEqualTo(RipristinoInSospeso.Esito.FALLITO);
        assertThat(leggiImporto(db)).isEqualTo(111);
        assertThat(dati.resolve("ripristino-fallito.json")).exists();
    }

    @Test
    void conUnMarcatoreIllegibileIlDatabaseResta() throws Exception {
        Path dati = dati();
        Path db = dati.resolve("contabilita.db");
        creaDatabase(db, 111);
        Files.writeString(dati.resolve("ripristino-in-attesa.json"), "{ non e' json");

        assertThat(RipristinoInSospeso.applica(dati)).isEqualTo(RipristinoInSospeso.Esito.FALLITO);
        assertThat(leggiImporto(db)).isEqualTo(111);
        assertThat(dati.resolve("ripristino-fallito.json")).exists();
        assertThat(dati.resolve("ripristino-in-attesa.json")).doesNotExist();
    }

    @Test
    void senzaMarcatoreNonFaNulla() throws Exception {
        Path dati = dati();
        Path db = dati.resolve("contabilita.db");
        creaDatabase(db, 111);
        long dimensione = Files.size(db);

        assertThat(RipristinoInSospeso.applica(dati)).isEqualTo(RipristinoInSospeso.Esito.NESSUNO);

        assertThat(leggiImporto(db)).isEqualTo(111);
        assertThat(Files.size(db)).isEqualTo(dimensione);
    }

    @Test
    void senzaNemmenoLaCartellaDatiNonFaNulla() {
        assertThat(RipristinoInSospeso.applica(radice.resolve("manca"))).isEqualTo(RipristinoInSospeso.Esito.NESSUNO);
    }
}
