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

/** La migrazione delle categorie su un database «di prima»: tutte quelle di prima diventano predefinite, le nuove sono personalizzate. */
class MigrazioneCategorieTest {

    private static final String CHANGELOG = "db/changelog/db.changelog-master.yaml";

    private static void aggiorna(Connection c, Contexts contesti) throws Exception {
        Database database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(c));
        new Liquibase(CHANGELOG, new ClassLoaderResourceAccessor(), database).update(contesti);
    }

    @Test
    void leCategoriePreesistentiDiventanoPredefiniteLeNuovePersonalizzate() throws Exception {
        Path file = Files.createTempFile("contabilita-migrazione-categorie-", ".db");
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file); Statement st = c.createStatement()) {
            aggiorna(c, new Contexts("statistiche")); // lo schema com'era prima delle categorie personalizzate (v1 - v5)
            st.executeUpdate("INSERT INTO categoria (nome, nome_chiave, tipo) VALUES "
                    + "('Affitto', 'affitto', 'COSTO_FISSO'),"
                    + "('Retribuzione', 'retribuzione', 'COSTO_FISSO'),"
                    + "('Utenze', 'utenze', 'COSTO_FISSO'),"
                    + "('Commercialista', 'commercialista', 'COSTO_FISSO'),"
                    + "('Affitto', 'affitto', 'COSTO_VARIABILE'),"
                    + "('Farine', 'farine', 'COSTO_VARIABILE'),"
                    + "('Delivery', 'delivery', 'RICAVO')");
            st.executeUpdate("INSERT INTO movimento (data, tipo, documento, importo_cent, categoria_id, origine, creato_il, modificato_il) VALUES "
                    + "('2026-03-01', 'COSTO_FISSO', 'NESSUNO', 60000, 1, 'MANO', '2026-03-01T10:00:00', '2026-03-01T10:00:00')");

            aggiorna(c, new Contexts()); // tutto, come all'avvio dell'applicazione

            List<String> categorie = new ArrayList<>();
            try (ResultSet rs = st.executeQuery("SELECT nome, tipo, personalizzata FROM categoria ORDER BY id")) {
                while (rs.next()) {
                    categorie.add(rs.getString("nome") + ":" + rs.getString("tipo") + ":" + rs.getInt("personalizzata"));
                }
            }
            assertThat(categorie).containsExactly(
                    "Affitto:COSTO_FISSO:0", "Retribuzione:COSTO_FISSO:0", "Utenze:COSTO_FISSO:0",
                    "Commercialista:COSTO_FISSO:0", "Affitto:COSTO_VARIABILE:0", "Farine:COSTO_VARIABILE:0", "Delivery:RICAVO:0");

            // niente righe perse, e la colonna e' obbligatoria con 1 come valore predefinito
            try (ResultSet rs = st.executeQuery("SELECT count(*) FROM movimento")) {
                assertThat(rs.next() && rs.getInt(1) == 1).isTrue();
            }
            try (ResultSet rs = st.executeQuery("SELECT \"notnull\", dflt_value FROM pragma_table_info('categoria') WHERE name = 'personalizzata'")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt("notnull")).isEqualTo(1);
                assertThat(rs.getString("dflt_value")).isEqualTo("1");
            }
            // una categoria creata dopo la migrazione e' personalizzata
            st.executeUpdate("INSERT INTO categoria (nome, nome_chiave, tipo) VALUES ('Nuova', 'nuova', 'RICAVO')");
            try (ResultSet rs = st.executeQuery("SELECT personalizzata FROM categoria WHERE nome_chiave = 'nuova'")) {
                assertThat(rs.next() && rs.getInt(1) == 1).isTrue();
            }
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    void unDatabaseVuotoParteSenzaCategorie() throws Exception {
        Path file = Files.createTempFile("contabilita-migrazione-categorie-", ".db");
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file); Statement st = c.createStatement()) {
            aggiorna(c, new Contexts());
            try (ResultSet rs = st.executeQuery("SELECT count(*) FROM categoria")) {
                assertThat(rs.next() && rs.getInt(1) == 0).isTrue();
            }
        } finally {
            Files.deleteIfExists(file);
        }
    }
}
