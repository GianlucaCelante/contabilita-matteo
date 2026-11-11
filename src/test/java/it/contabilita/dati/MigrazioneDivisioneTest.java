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

/**
 * La migrazione v13: la colonna «divisione» su movimento e ricorrenza. Solo aggiunte: i dati gia' presenti restano
 * identici e la colonna e' null. Si prova su una COPIA di un database v12 (mai su quello vero); la cartella della prova
 * si puo' indicare con {@code -Dcontabilita.prova.cartella=...} (i due file restano li'), altrimenti e' temporanea.
 */
class MigrazioneDivisioneTest {

    private static final String CHANGELOG = "db/changelog/db.changelog-master.yaml";

    private static void aggiorna(Connection c, Contexts contesti) throws Exception {
        Database database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(c));
        new Liquibase(CHANGELOG, new ClassLoaderResourceAccessor(), database).update(contesti);
        c.setAutoCommit(true); // Liquibase lo spegne: senza, le righe inserite dopo andrebbero perse alla chiusura
    }

    private static int conta(Statement st, String sql) throws Exception {
        try (ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getInt(1);
        }
    }

    /** Tutte le righe di una tabella come testo, colonna per colonna (senza «divisione»), per confrontare prima e dopo. */
    private static String contenuto(Statement st, String tabella) throws Exception {
        StringBuilder testo = new StringBuilder();
        try (ResultSet rs = st.executeQuery("SELECT * FROM " + tabella + " ORDER BY id")) {
            int colonne = rs.getMetaData().getColumnCount();
            while (rs.next()) {
                for (int i = 1; i <= colonne; i++) {
                    if (!rs.getMetaData().getColumnName(i).equals("divisione")) {
                        testo.append(rs.getMetaData().getColumnName(i)).append('=').append(rs.getString(i)).append(';');
                    }
                }
                testo.append('\n');
            }
        }
        return testo.toString();
    }

    @Test
    void iDatiRestanoIntattiELaColonnaENullSuiVecchi() throws Exception {
        String indicata = System.getProperty("contabilita.prova.cartella");
        boolean temporanea = indicata == null || indicata.isBlank();
        Path cartella = temporanea ? Files.createTempDirectory("contabilita-migrazione-divisione-") : Files.createDirectories(Path.of(indicata));
        Path originale = cartella.resolve("v12-originale.db");
        Path copia = cartella.resolve("v12-copia-migrata.db");
        Files.deleteIfExists(originale);
        Files.deleteIfExists(copia);
        try {
            String movimentiPrima;
            String ricorrenzePrima;
            try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + originale); Statement st = c.createStatement()) {
                // lo schema com'era alla v12
                aggiorna(c, new Contexts("ripetizioni", "sedi", "statistiche", "categorie", "retribuzione", "senza-personalizzata",
                        "pagata", "fatture", "giorni", "personale"));
                assertThat(conta(st, "SELECT count(*) FROM pragma_table_info('sede') WHERE name = 'personale'")).isEqualTo(1);
                assertThat(conta(st, "SELECT count(*) FROM pragma_table_info('movimento') WHERE name = 'divisione'")).isZero();
                assertThat(conta(st, "SELECT count(*) FROM pragma_table_info('ricorrenza') WHERE name = 'divisione'")).isZero();
                st.executeUpdate("INSERT INTO sede (nome, nome_chiave, archiviata, ordine, creato_il) "
                        + "VALUES ('Mare', 'mare', 0, 2, '2026-03-01T10:00:00')");
                st.executeUpdate("INSERT INTO fornitore (nome, nome_chiave) VALUES ('Forno Prova', 'forno prova')");
                st.executeUpdate("INSERT INTO ricorrenza (giorno, attiva, tipo, documento, importo_cent, ultimo_mese, creata_il, sede_id, "
                        + "unita, intervallo, prossima_data) VALUES "
                        + "(5, 1, 'COSTO_FISSO', 'NESSUNO', 30000, '2026-02', '2026-01-05T10:00:00', 1, 'MESI', 1, '2026-03-05'),"
                        + "(5, 1, 'COSTO_FISSO', 'NESSUNO', 30000, '2026-02', '2026-01-05T10:00:00', 2, 'MESI', 1, '2026-03-05')");
                // una fattura divisa fra le due sedi (com'era prima: nessun id comune), una ripetizione per sede, una importata
                st.executeUpdate("INSERT INTO movimento (data, tipo, documento, importo_cent, fornitore_id, numero_documento, ricorrenza_id, "
                        + "anno_mese, origine, pagata, sede_id, creato_il, modificato_il) VALUES "
                        + "('2026-02-06', 'COSTO_VARIABILE', 'FATTURA', 500, 1, 'F/1', NULL, NULL, 'MANO', 0, 1, '2026-02-06T10:00:00', '2026-02-06T10:00:00'),"
                        + "('2026-02-06', 'COSTO_VARIABILE', 'FATTURA', 500, 1, 'F/1', NULL, NULL, 'MANO', 1, 2, '2026-02-06T10:00:00', '2026-02-06T10:00:00'),"
                        + "('2026-02-05', 'COSTO_FISSO', 'NESSUNO', 30000, NULL, NULL, 1, '2026-02', 'RICORRENZA', 0, 1, '2026-02-05T10:00:00', '2026-02-05T10:00:00'),"
                        + "('2026-02-05', 'COSTO_FISSO', 'NESSUNO', 30000, NULL, NULL, 2, '2026-02', 'RICORRENZA', 0, 2, '2026-02-05T10:00:00', '2026-02-05T10:00:00'),"
                        + "('2026-02-07', 'COSTO_VARIABILE', 'FATTURA', 12300, 1, 'F/2', NULL, NULL, 'XML', 1, 1, '2026-02-07T10:00:00', '2026-02-07T10:00:00')");
                movimentiPrima = contenuto(st, "movimento");
                ricorrenzePrima = contenuto(st, "ricorrenza");
            }

            Files.copy(originale, copia); // la migrazione gira sulla copia: l'originale non si tocca
            try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + copia); Statement st = c.createStatement()) {
                aggiorna(c, new Contexts()); // tutto, come all'avvio dell'applicazione

                assertThat(conta(st, "SELECT count(*) FROM pragma_table_info('movimento') WHERE name = 'divisione'")).isEqualTo(1);
                assertThat(conta(st, "SELECT count(*) FROM pragma_table_info('ricorrenza') WHERE name = 'divisione'")).isEqualTo(1);
                assertThat(conta(st, "SELECT \"notnull\" FROM pragma_table_info('movimento') WHERE name = 'divisione'")).isZero();
                // niente righe perse o cambiate, e la colonna nuova e' null su tutto quello che c'era
                assertThat(contenuto(st, "movimento")).isEqualTo(movimentiPrima);
                assertThat(contenuto(st, "ricorrenza")).isEqualTo(ricorrenzePrima);
                assertThat(conta(st, "SELECT count(*) FROM movimento")).isEqualTo(5);
                assertThat(conta(st, "SELECT count(*) FROM movimento WHERE divisione IS NULL")).isEqualTo(5);
                assertThat(conta(st, "SELECT count(*) FROM ricorrenza WHERE divisione IS NULL")).isEqualTo(2);
                assertThat(conta(st, "SELECT count(*) FROM sede")).isEqualTo(2);
                assertThat(conta(st, "SELECT count(*) FROM fornitore")).isEqualTo(1);
                // la colonna e' facoltativa: un movimento nuovo senza il campo resta null, con il campo lo tiene
                st.executeUpdate("INSERT INTO movimento (data, tipo, documento, importo_cent, origine, pagata, sede_id, creato_il, modificato_il) VALUES "
                        + "('2026-03-01', 'RICAVO', 'RICAVO_EXTRA', 100, 'MANO', 0, 1, '2026-03-01T10:00:00', '2026-03-01T10:00:00')");
                st.executeUpdate("INSERT INTO movimento (data, tipo, documento, importo_cent, origine, pagata, sede_id, divisione, creato_il, modificato_il) VALUES "
                        + "('2026-03-01', 'RICAVO', 'RICAVO_EXTRA', 100, 'MANO', 0, 2, 'abc', '2026-03-01T10:00:00', '2026-03-01T10:00:00')");
                assertThat(conta(st, "SELECT count(*) FROM movimento WHERE divisione = 'abc'")).isEqualTo(1);

                aggiorna(c, new Contexts()); // un secondo aggiornamento non cambia nulla
                assertThat(conta(st, "SELECT count(*) FROM movimento")).isEqualTo(7);
                assertThat(conta(st, "SELECT count(*) FROM movimento WHERE divisione IS NULL")).isEqualTo(6);
            }
            // l'originale e' rimasto alla v12, con i suoi dati
            try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + originale); Statement st = c.createStatement()) {
                assertThat(conta(st, "SELECT count(*) FROM pragma_table_info('movimento') WHERE name = 'divisione'")).isZero();
                assertThat(contenuto(st, "movimento")).isEqualTo(movimentiPrima);
            }
        } finally {
            if (temporanea) {
                Files.deleteIfExists(originale);
                Files.deleteIfExists(copia);
                Files.deleteIfExists(cartella);
            }
        }
    }
}
