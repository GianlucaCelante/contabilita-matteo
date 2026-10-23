package it.contabilita.dati;

import liquibase.Contexts;
import liquibase.Liquibase;
import liquibase.database.Database;
import liquibase.database.DatabaseFactory;
import liquibase.database.jvm.JdbcConnection;
import liquibase.resource.ClassLoaderResourceAccessor;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** La migrazione delle ripetizioni su un database «di prima»: schema vecchio, dati veri, poi l'aggiornamento. */
class MigrazioneRipetizioniTest {

    private static final String CHANGELOG = "db/changelog/db.changelog-master.yaml";

    private static void aggiorna(Connection c, Contexts contesti) throws Exception {
        Database database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(c));
        new Liquibase(CHANGELOG, new ClassLoaderResourceAccessor(), database).update(contesti);
    }

    @Test
    void leRipetizioniMensiliDiPrimaDiventanoPersonalizzabiliSenzaCambiareLaProssimaScadenza() throws Exception {
        Path file = Files.createTempFile("contabilita-migrazione-", ".db");
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file); Statement st = c.createStatement()) {
            aggiorna(c, new Contexts("!ripetizioni")); // lo schema com'era prima
            st.executeUpdate("INSERT INTO ricorrenza (giorno, attiva, tipo, documento, importo_cent, ultimo_mese, creata_il) VALUES "
                    + "(31, 1, 'COSTO_FISSO', 'NESSUNO', 50000, '2026-01', '2026-01-31T10:00:00'),"   // il 31 di gennaio: la prossima e' il 28 febbraio
                    + "(5, 1, 'COSTO_FISSO', 'NESSUNO', 60000, '2025-12', '2025-12-05T10:00:00'),"    // il 5: la prossima e' il 5 gennaio (passaggio d'anno)
                    + "(15, 0, 'COSTO_FISSO', 'NESSUNO', 70000, '2026-02', '2026-02-15T10:00:00'),"   // ferma: la scadenza si calcola uguale
                    + "(10, 1, 'COSTO_FISSO', 'NESSUNO', 80000, '2025-12', '2025-12-10T10:00:00')");
            st.executeUpdate("INSERT INTO movimento (data, tipo, documento, importo_cent, ricorrenza_id, anno_mese, origine, creato_il, modificato_il) VALUES "
                    + "('2026-01-31', 'COSTO_FISSO', 'NESSUNO', 50000, 1, '2026-01', 'MANO', '2026-01-31T10:00:00', '2026-01-31T10:00:00')");

            aggiorna(c, new Contexts()); // tutto, come all'avvio dell'applicazione

            List<String> viste = new ArrayList<>();
            try (ResultSet rs = st.executeQuery("SELECT id, unita, intervallo, prossima_data, attiva FROM ricorrenza ORDER BY id")) {
                while (rs.next()) {
                    viste.add(rs.getInt("id") + ":" + rs.getString("unita") + ":" + rs.getInt("intervallo") + ":" + rs.getString("prossima_data") + ":" + rs.getInt("attiva"));
                }
            }
            assertThat(viste).containsExactly(
                    "1:MESI:1:2026-02-28:1",
                    "2:MESI:1:2026-01-05:1",
                    "3:MESI:1:2026-03-15:0",
                    "4:MESI:1:2026-01-10:1");

            // il vecchio vincolo «un'occorrenza per mese» non c'e' piu': due movimenti della stessa ripetizione nello stesso mese si possono salvare
            st.executeUpdate("INSERT INTO movimento (data, tipo, documento, importo_cent, ricorrenza_id, anno_mese, origine, creato_il, modificato_il) VALUES "
                    + "('2026-01-12', 'COSTO_FISSO', 'NESSUNO', 50000, 1, '2026-01', 'RICORRENZA', '2026-01-12T10:00:00', '2026-01-12T10:00:00')");
            try (ResultSet rs = st.executeQuery("SELECT count(*) FROM movimento WHERE ricorrenza_id = 1")) {
                rs.next();
                assertThat(rs.getInt(1)).isEqualTo(2);
            }
        } finally {
            Files.deleteIfExists(file);
        }
    }
}
