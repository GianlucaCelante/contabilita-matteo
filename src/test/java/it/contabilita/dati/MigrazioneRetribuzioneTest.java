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

/** La migrazione del flag «retribuzione» delle categorie su un database «di prima». */
class MigrazioneRetribuzioneTest {

    private static final String CHANGELOG = "db/changelog/db.changelog-master.yaml";

    private static void aggiorna(Connection c, Contexts contesti) throws Exception {
        Database database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(c));
        new Liquibase(CHANGELOG, new ClassLoaderResourceAccessor(), database).update(contesti);
    }

    /** Lo schema com'era prima del flag (v1 - v6). */
    private static void schemaPrima(Connection c) throws Exception {
        aggiorna(c, new Contexts("ripetizioni", "sedi", "statistiche", "categorie"));
    }

    private static int conta(Statement st, String sql) throws Exception {
        try (ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getInt(1);
        }
    }

    private static void movimento(Statement st, String documento, String categoriaId) throws Exception {
        st.executeUpdate("INSERT INTO movimento (data, tipo, documento, importo_cent, categoria_id, origine, creato_il, modificato_il, sede_id) VALUES "
                + "('2026-03-01', 'COSTO_FISSO', '" + documento + "', 60000, " + categoriaId + ", 'MANO', '2026-03-01T10:00:00', '2026-03-01T10:00:00', 1)");
    }

    private static void ripetizione(Statement st, String documento) throws Exception {
        st.executeUpdate("INSERT INTO ricorrenza (giorno, attiva, tipo, documento, importo_cent, ultimo_mese, creata_il, sede_id) VALUES "
                + "(1, 1, 'COSTO_FISSO', '" + documento + "', 60000, '2026-03', '2026-03-01T10:00:00', 1)");
    }

    @Test
    void conRetribuzioniSenzaCategoriaLaCreaELeAssegna() throws Exception {
        Path file = Files.createTempFile("contabilita-migrazione-retribuzione-", ".db");
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file); Statement st = c.createStatement()) {
            schemaPrima(c);
            st.executeUpdate("INSERT INTO categoria (nome, nome_chiave, tipo) VALUES ('Affitto', 'affitto', 'COSTO_FISSO')");
            movimento(st, "RETRIBUZIONE_REGOLARE", "NULL");
            movimento(st, "RETRIBUZIONE_EXTRA", "NULL");
            movimento(st, "NESSUNO", "1");
            movimento(st, "NESSUNO", "NULL");
            ripetizione(st, "RETRIBUZIONE_REGOLARE");

            aggiorna(c, new Contexts());

            assertThat(conta(st, "SELECT count(*) FROM categoria")).isEqualTo(2);
            try (ResultSet rs = st.executeQuery("SELECT id, nome, tipo, retribuzione FROM categoria WHERE nome_chiave = 'retribuzione'")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getString("nome")).isEqualTo("Retribuzione");
                assertThat(rs.getString("tipo")).isEqualTo("COSTO_FISSO");
                assertThat(rs.getInt("retribuzione")).isEqualTo(1);
            }
            // Affitto non e' una retribuzione
            assertThat(conta(st, "SELECT retribuzione FROM categoria WHERE nome_chiave = 'affitto'")).isZero();
            // le retribuzioni sono assegnate, gli altri movimenti non cambiano
            assertThat(conta(st, "SELECT count(*) FROM movimento m JOIN categoria c ON c.id = m.categoria_id "
                    + "WHERE c.nome_chiave = 'retribuzione' AND m.documento LIKE 'RETRIBUZIONE_%'")).isEqualTo(2);
            assertThat(conta(st, "SELECT count(*) FROM movimento WHERE documento = 'NESSUNO' AND categoria_id = 1")).isEqualTo(1);
            assertThat(conta(st, "SELECT count(*) FROM movimento WHERE documento = 'NESSUNO' AND categoria_id IS NULL")).isEqualTo(1);
            assertThat(conta(st, "SELECT count(*) FROM ricorrenza r JOIN categoria c ON c.id = r.categoria_id WHERE c.nome_chiave = 'retribuzione'")).isEqualTo(1);
            // colonna obbligatoria, falsa per le categorie create dopo
            try (ResultSet rs = st.executeQuery("SELECT \"notnull\", dflt_value FROM pragma_table_info('categoria') WHERE name = 'retribuzione'")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt("notnull")).isEqualTo(1);
                assertThat(rs.getString("dflt_value")).isEqualTo("0");
            }
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    void conUnaCategoriaRetribuzioneEsistenteLaContrassegnaSoltanto() throws Exception {
        Path file = Files.createTempFile("contabilita-migrazione-retribuzione-", ".db");
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file); Statement st = c.createStatement()) {
            schemaPrima(c);
            st.executeUpdate("INSERT INTO categoria (nome, nome_chiave, tipo) VALUES "
                    + "('Retribuzione', 'retribuzione', 'COSTO_VARIABILE'),"
                    + "('Retribuzione', 'retribuzione', 'COSTO_FISSO'),"
                    + "('Utenze', 'utenze', 'COSTO_FISSO')");
            movimento(st, "RETRIBUZIONE_REGOLARE", "NULL");

            aggiorna(c, new Contexts());

            assertThat(conta(st, "SELECT count(*) FROM categoria")).isEqualTo(3); // nessuna nuova
            assertThat(conta(st, "SELECT retribuzione FROM categoria WHERE id = 2")).isEqualTo(1);
            assertThat(conta(st, "SELECT count(*) FROM categoria WHERE retribuzione = 1")).isEqualTo(1);
            // la retribuzione senza categoria passa a quella esistente (di COSTO_FISSO)
            assertThat(conta(st, "SELECT categoria_id FROM movimento")).isEqualTo(2);
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    void senzaRetribuzioniNonCreaNulla() throws Exception {
        Path file = Files.createTempFile("contabilita-migrazione-retribuzione-", ".db");
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file); Statement st = c.createStatement()) {
            schemaPrima(c);
            st.executeUpdate("INSERT INTO categoria (nome, nome_chiave, tipo) VALUES ('Affitto', 'affitto', 'COSTO_FISSO')");
            movimento(st, "NESSUNO", "NULL");

            aggiorna(c, new Contexts());

            assertThat(conta(st, "SELECT count(*) FROM categoria")).isEqualTo(1);
            assertThat(conta(st, "SELECT count(*) FROM categoria WHERE retribuzione = 1")).isZero();
            assertThat(conta(st, "SELECT count(*) FROM movimento WHERE categoria_id IS NULL")).isEqualTo(1);
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    void unDatabaseVuotoParteSenzaCategorie() throws Exception {
        Path file = Files.createTempFile("contabilita-migrazione-retribuzione-", ".db");
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file); Statement st = c.createStatement()) {
            aggiorna(c, new Contexts());
            assertThat(conta(st, "SELECT count(*) FROM categoria")).isZero();
        } finally {
            Files.deleteIfExists(file);
        }
    }
}
