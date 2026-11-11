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

/**
 * La migrazione delle pizze giornaliere (versione 11) su un database con i vecchi dati settimanali: i dati di prima restano
 * come sono, la tabella nuova ha l'indice unico (sede, giorno) e i controlli sui numeri non negativi.
 */
class MigrazioneGiorniTest {

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
    void laTabellaDeiGiorniNonToccaIVecchiDatiSettimanali() throws Exception {
        Path file = Files.createTempFile("contabilita-migrazione-giorni-", ".db");
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file); Statement st = c.createStatement()) {
            // lo schema com'era prima dei giorni (v1 - v10)
            aggiorna(c, new Contexts("ripetizioni", "sedi", "statistiche", "categorie", "retribuzione", "senza-personalizzata",
                    "pagata", "fatture"));
            assertThat(conta(st, "SELECT count(*) FROM sqlite_master WHERE name = 'dati_giorno'")).isZero();
            st.executeUpdate("INSERT INTO dati_settimana (sede_id, settimana, pizze, ordini, modificato_il) "
                    + "VALUES (1, '2026-03-02', 120, 45, '2026-03-09T10:00:00')");

            aggiorna(c, new Contexts()); // tutto, come all'avvio dell'applicazione

            try (ResultSet rs = st.executeQuery("SELECT settimana, pizze, ordini FROM dati_settimana")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getString(1)).isEqualTo("2026-03-02");
                assertThat(rs.getInt(2)).isEqualTo(120);
                assertThat(rs.getInt(3)).isEqualTo(45);
                assertThat(rs.next()).isFalse();
            }
            assertThat(conta(st, "SELECT count(*) FROM dati_giorno")).isZero();
            assertThat(conta(st, "SELECT count(*) FROM pragma_foreign_key_list('dati_giorno') WHERE \"table\" = 'sede' AND \"from\" = 'sede_id'"))
                    .isEqualTo(1);
            assertThat(conta(st, "SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name = 'ux_dati_giorno_sede_giorno'"))
                    .isEqualTo(1);

            String ok = "INSERT INTO dati_giorno (sede_id, giorno, pizze, ordini, modificato_il) VALUES (1, '2026-03-03', 10, 4, '2026-03-03T22:00:00')";
            st.executeUpdate(ok);
            assertThatThrownBy(() -> st.executeUpdate(ok)).hasMessageContaining("UNIQUE");
            assertThatThrownBy(() -> st.executeUpdate("INSERT INTO dati_giorno (sede_id, giorno, pizze, ordini, modificato_il) "
                    + "VALUES (1, '2026-03-04', -1, 4, 'x')")).hasMessageContaining("negativi");
            assertThatThrownBy(() -> st.executeUpdate("UPDATE dati_giorno SET ordini = -3")).hasMessageContaining("negativi");
            assertThat(conta(st, "SELECT count(*) FROM dati_giorno")).isEqualTo(1);
            assertThat(conta(st, "SELECT count(*) FROM dati_settimana")).isEqualTo(1);
        } finally {
            Files.deleteIfExists(file);
        }
    }
}
