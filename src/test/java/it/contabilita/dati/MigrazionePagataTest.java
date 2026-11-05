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

/** La migrazione v9: la colonna «pagata» e le fatture gia' presenti segnate come pagate. */
class MigrazionePagataTest {

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

    private static void movimento(Statement st, String tipo, String documento) throws Exception {
        st.executeUpdate("INSERT INTO movimento (data, tipo, documento, importo_cent, origine, creato_il, modificato_il, sede_id) VALUES "
                + "('2026-03-01', '" + tipo + "', '" + documento + "', 1000, 'MANO', '2026-03-01T10:00:00', '2026-03-01T10:00:00', 1)");
    }

    @Test
    void leFattureEsistentiSonoPagateGliAltriDocumentiNo() throws Exception {
        Path file = Files.createTempFile("contabilita-migrazione-pagata-", ".db");
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file); Statement st = c.createStatement()) {
            // lo schema com'era prima della v9
            aggiorna(c, new Contexts("ripetizioni", "sedi", "statistiche", "categorie", "retribuzione", "senza-personalizzata"));
            assertThat(conta(st, "SELECT count(*) FROM pragma_table_info('movimento') WHERE name = 'pagata'")).isZero();
            movimento(st, "COSTO_VARIABILE", "FATTURA");
            movimento(st, "COSTO_VARIABILE", "FATTURA");
            movimento(st, "COSTO_VARIABILE", "NOTA_DI_CREDITO");
            movimento(st, "COSTO_VARIABILE", "SCONTRINO");
            movimento(st, "RICAVO", "RICAVO_EXTRA");

            aggiorna(c, new Contexts());

            assertThat(conta(st, "SELECT count(*) FROM movimento WHERE documento = 'FATTURA' AND pagata = 1")).isEqualTo(2);
            assertThat(conta(st, "SELECT count(*) FROM movimento WHERE documento <> 'FATTURA' AND pagata = 0")).isEqualTo(3);
            // colonna obbligatoria, da pagare per i movimenti nuovi
            try (ResultSet rs = st.executeQuery("SELECT \"notnull\", dflt_value FROM pragma_table_info('movimento') WHERE name = 'pagata'")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt("notnull")).isEqualTo(1);
                assertThat(rs.getString("dflt_value")).isEqualTo("0");
            }
            movimento(st, "COSTO_VARIABILE", "FATTURA");
            assertThat(conta(st, "SELECT count(*) FROM movimento WHERE pagata = 0 AND documento = 'FATTURA'")).isEqualTo(1);
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    void unSecondoAggiornamentoNonCambiaNulla() throws Exception {
        Path file = Files.createTempFile("contabilita-migrazione-pagata-", ".db");
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file); Statement st = c.createStatement()) {
            aggiorna(c, new Contexts());
            movimento(st, "COSTO_VARIABILE", "FATTURA");
            aggiorna(c, new Contexts());
            assertThat(conta(st, "SELECT count(*) FROM movimento WHERE pagata = 0")).isEqualTo(1);
        } finally {
            Files.deleteIfExists(file);
        }
    }
}
