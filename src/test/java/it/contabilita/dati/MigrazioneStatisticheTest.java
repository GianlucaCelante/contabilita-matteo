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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** La migrazione delle statistiche su un database «di prima» (con le sedi): tabella, indice unico e numeri non negativi. */
class MigrazioneStatisticheTest {

    private static final String CHANGELOG = "db/changelog/db.changelog-master.yaml";

    private static void aggiorna(Connection c, Contexts contesti) throws Exception {
        Database database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(c));
        new Liquibase(CHANGELOG, new ClassLoaderResourceAccessor(), database).update(contesti);
    }

    private static long conta(Statement st, String sql) throws Exception {
        try (ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getLong(1);
        }
    }

    @Test
    void laTabellaNuovaNonToccaIDatiDiPrimaEHaIndiceUnicoEControlli() throws Exception {
        Path file = Files.createTempFile("contabilita-migrazione-statistiche-", ".db");
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file); Statement st = c.createStatement()) {
            aggiorna(c, new Contexts("ripetizioni", "sedi")); // lo schema com'era prima delle statistiche (v1-v4)
            assertThat(conta(st, "SELECT count(*) FROM sqlite_master WHERE name = 'dati_settimana'")).isZero();
            st.executeUpdate("INSERT INTO movimento (data, tipo, documento, importo_cent, origine, creato_il, modificato_il) VALUES "
                    + "('2026-02-07', 'RICAVO', 'RICAVO_EXTRA', 5000, 'MANO', '2026-02-07T10:00:00', '2026-02-07T10:00:00')");

            aggiorna(c, new Contexts()); // tutto, come all'avvio dell'applicazione

            assertThat(conta(st, "SELECT count(*) FROM movimento")).isEqualTo(1);
            assertThat(conta(st, "SELECT count(*) FROM sede")).isEqualTo(1);
            assertThat(conta(st, "SELECT count(*) FROM dati_settimana")).isZero();
            assertThat(conta(st, "SELECT count(*) FROM pragma_foreign_key_list('dati_settimana') WHERE \"table\" = 'sede' AND \"from\" = 'sede_id'"))
                    .isEqualTo(1);
            assertThat(conta(st, "SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name = 'ux_dati_settimana_sede_settimana'"))
                    .isEqualTo(1);

            String ok = "INSERT INTO dati_settimana (sede_id, settimana, pizze, ordini, modificato_il) VALUES (1, '2026-03-02', 10, 4, '2026-03-09T10:00:00')";
            st.executeUpdate(ok);
            // un solo dato per sede e settimana
            assertThatThrownBy(() -> st.executeUpdate(ok)).hasMessageContaining("UNIQUE");
            // numeri non negativi, anche scrivendo direttamente nel database
            assertThatThrownBy(() -> st.executeUpdate("INSERT INTO dati_settimana (sede_id, settimana, pizze, ordini, modificato_il) "
                    + "VALUES (1, '2026-03-09', -1, 4, 'x')")).hasMessageContaining("negativi");
            assertThatThrownBy(() -> st.executeUpdate("UPDATE dati_settimana SET ordini = -3")).hasMessageContaining("negativi");
            assertThat(conta(st, "SELECT count(*) FROM dati_settimana")).isEqualTo(1);
        } finally {
            Files.deleteIfExists(file);
        }
    }
}
