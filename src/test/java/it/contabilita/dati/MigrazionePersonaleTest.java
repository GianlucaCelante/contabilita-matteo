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

/** La migrazione v12: la colonna «personale» sulla sede; le sedi gia' presenti restano normali. */
class MigrazionePersonaleTest {

    private static final String CHANGELOG = "db/changelog/db.changelog-master.yaml";

    private static void aggiorna(Connection c, Contexts contesti) throws Exception {
        Database database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(c));
        new Liquibase(CHANGELOG, new ClassLoaderResourceAccessor(), database).update(contesti);
    }

    private static int conta(Statement st, String sql) throws Exception {
        try (ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getInt(1);
        }
    }

    @Test
    void leSediEsistentiRestanoNonPersonali() throws Exception {
        Path file = Files.createTempFile("contabilita-migrazione-personale-", ".db");
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file); Statement st = c.createStatement()) {
            // lo schema com'era prima della v12
            aggiorna(c, new Contexts("ripetizioni", "sedi", "statistiche", "categorie", "retribuzione", "senza-personalizzata",
                    "pagata", "fatture", "giorni"));
            assertThat(conta(st, "SELECT count(*) FROM pragma_table_info('sede') WHERE name = 'personale'")).isZero();
            st.executeUpdate("INSERT INTO sede (nome, nome_chiave, archiviata, ordine, creato_il) "
                    + "VALUES ('Mare', 'mare', 1, 2, '2026-03-01T10:00:00')");

            aggiorna(c, new Contexts()); // tutto, come all'avvio dell'applicazione

            assertThat(conta(st, "SELECT count(*) FROM sede")).isEqualTo(2);
            assertThat(conta(st, "SELECT count(*) FROM sede WHERE personale = 0")).isEqualTo(2);
            try (ResultSet rs = st.executeQuery("SELECT \"notnull\", dflt_value FROM pragma_table_info('sede') WHERE name = 'personale'")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt("notnull")).isEqualTo(1);
                assertThat(rs.getString("dflt_value")).isEqualTo("0");
            }
            // una sede nuova senza il campo e' normale
            st.executeUpdate("INSERT INTO sede (nome, nome_chiave, archiviata, ordine, creato_il) "
                    + "VALUES ('Monti', 'monti', 0, 3, '2026-03-01T10:00:00')");
            assertThat(conta(st, "SELECT personale FROM sede WHERE nome = 'Monti'")).isZero();

            aggiorna(c, new Contexts()); // un secondo aggiornamento non cambia nulla
            assertThat(conta(st, "SELECT count(*) FROM sede WHERE personale = 0")).isEqualTo(3);
        } finally {
            Files.deleteIfExists(file);
        }
    }
}
