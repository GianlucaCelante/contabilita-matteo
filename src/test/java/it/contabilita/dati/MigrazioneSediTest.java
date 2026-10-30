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

/** La migrazione delle sedi su un database «di prima»: movimenti e ripetizioni veri, poi l'aggiornamento. */
class MigrazioneSediTest {

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
    void tuttiIDatiDiPrimaPassanoAllaSedePrincipaleSenzaPerdereRighe() throws Exception {
        Path file = Files.createTempFile("contabilita-migrazione-sedi-", ".db");
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file); Statement st = c.createStatement()) {
            aggiorna(c, new Contexts("ripetizioni")); // lo schema com'era prima delle sedi (v1, v2, v3)
            st.executeUpdate("INSERT INTO fornitore (nome, nome_chiave) VALUES ('Forno Prova', 'forno prova')");
            st.executeUpdate("INSERT INTO ricorrenza (giorno, attiva, tipo, documento, importo_cent, ultimo_mese, creata_il) VALUES "
                    + "(5, 1, 'COSTO_FISSO', 'NESSUNO', 60000, '2026-01', '2026-01-05T10:00:00'),"
                    + "(10, 0, 'COSTO_FISSO', 'NESSUNO', 80000, '2026-02', '2026-02-10T10:00:00')");
            st.executeUpdate("INSERT INTO movimento (data, tipo, documento, importo_cent, fornitore_id, ricorrenza_id, anno_mese, origine, creato_il, modificato_il) VALUES "
                    + "('2026-01-05', 'COSTO_FISSO', 'NESSUNO', 60000, NULL, 1, '2026-01', 'MANO', '2026-01-05T10:00:00', '2026-01-05T10:00:00'),"
                    + "('2026-02-05', 'COSTO_FISSO', 'NESSUNO', 60000, NULL, 1, '2026-02', 'RICORRENZA', '2026-02-05T10:00:00', '2026-02-05T10:00:00'),"
                    + "('2026-02-06', 'COSTO_VARIABILE', 'FATTURA', 12300, 1, NULL, NULL, 'XML', '2026-02-06T10:00:00', '2026-02-06T10:00:00'),"
                    + "('2026-02-07', 'RICAVO', 'RICAVO_EXTRA', 5000, NULL, NULL, NULL, 'MANO', '2026-02-07T10:00:00', '2026-02-07T10:00:00')");
            assertThat(conta(st, "SELECT count(*) FROM movimento")).isEqualTo(4);

            aggiorna(c, new Contexts()); // tutto, come all'avvio dell'applicazione

            // niente righe perse
            assertThat(conta(st, "SELECT count(*) FROM movimento")).isEqualTo(4);
            assertThat(conta(st, "SELECT count(*) FROM ricorrenza")).isEqualTo(2);

            // la sede principale c'e', una sola, e tutto e' suo
            List<String> sedi = new ArrayList<>();
            try (ResultSet rs = st.executeQuery("SELECT id, nome, nome_chiave, archiviata, ordine FROM sede ORDER BY id")) {
                while (rs.next()) {
                    sedi.add(rs.getInt("id") + ":" + rs.getString("nome") + ":" + rs.getString("nome_chiave") + ":"
                            + rs.getInt("archiviata") + ":" + rs.getInt("ordine"));
                }
            }
            assertThat(sedi).containsExactly("1:Sede principale:sede principale:0:1");
            assertThat(conta(st, "SELECT count(*) FROM movimento WHERE sede_id = 1")).isEqualTo(4);
            assertThat(conta(st, "SELECT count(*) FROM ricorrenza WHERE sede_id = 1")).isEqualTo(2);
            assertThat(conta(st, "SELECT count(*) FROM sede WHERE creato_il LIKE '____-__-__T__:__:__'")).isEqualTo(1);

            // le colonne sono obbligatorie e agganciate a sede (chiave esterna dichiarata)
            try (ResultSet rs = st.executeQuery("SELECT name, \"notnull\" FROM pragma_table_info('movimento') WHERE name = 'sede_id'")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt("notnull")).isEqualTo(1);
            }
            try (ResultSet rs = st.executeQuery("SELECT name, \"notnull\" FROM pragma_table_info('ricorrenza') WHERE name = 'sede_id'")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt("notnull")).isEqualTo(1);
            }
            assertThat(conta(st, "SELECT count(*) FROM pragma_foreign_key_list('movimento') WHERE \"table\" = 'sede' AND \"from\" = 'sede_id'")).isEqualTo(1);
            assertThat(conta(st, "SELECT count(*) FROM pragma_foreign_key_list('ricorrenza') WHERE \"table\" = 'sede' AND \"from\" = 'sede_id'")).isEqualTo(1);

            // gli indici di prima ci sono ancora, e quello nuovo anche
            assertThat(conta(st, "SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name IN "
                    + "('ix_movimento_data', 'ix_movimento_tipo', 'ix_movimento_ricorrenza_data', 'ix_movimento_sede', 'ux_sede_nome')")).isEqualTo(5);

            // il nome e' unico senza distinguere maiuscole (la chiave e' il nome in minuscolo)
            st.executeUpdate("INSERT INTO sede (nome, nome_chiave, ordine, creato_il) VALUES ('Sede Mare', 'sede mare', 2, '2026-03-01T10:00:00')");
            try {
                st.executeUpdate("INSERT INTO sede (nome, nome_chiave, ordine, creato_il) VALUES ('SEDE MARE', 'sede mare', 3, '2026-03-01T10:00:00')");
                org.junit.jupiter.api.Assertions.fail("il nome doppio doveva essere rifiutato");
            } catch (java.sql.SQLException atteso) {
                assertThat(atteso.getMessage()).containsIgnoringCase("unique");
            }

            // e un movimento nuovo, scritto da una versione che indica la sede, la tiene
            st.executeUpdate("INSERT INTO movimento (data, tipo, documento, importo_cent, origine, sede_id, creato_il, modificato_il) VALUES "
                    + "('2026-03-01', 'RICAVO', 'RICAVO_EXTRA', 100, 'MANO', 2, '2026-03-01T10:00:00', '2026-03-01T10:00:00')");
            assertThat(conta(st, "SELECT count(*) FROM movimento WHERE sede_id = 2")).isEqualTo(1);
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    void unDatabaseVuotoHaComunqueLaSedePrincipale() throws Exception {
        Path file = Files.createTempFile("contabilita-migrazione-sedi-", ".db");
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file); Statement st = c.createStatement()) {
            aggiorna(c, new Contexts());
            assertThat(conta(st, "SELECT count(*) FROM sede")).isEqualTo(1);
            assertThat(conta(st, "SELECT count(*) FROM sede WHERE id = 1 AND nome = 'Sede principale' AND archiviata = 0")).isEqualTo(1);
            assertThat(conta(st, "SELECT count(*) FROM movimento")).isZero();
        } finally {
            Files.deleteIfExists(file);
        }
    }
}
