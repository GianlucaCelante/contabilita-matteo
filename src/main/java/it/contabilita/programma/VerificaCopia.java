package it.contabilita.programma;

import org.sqlite.SQLiteConfig;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Controlli su un file database prima di usarlo come copia da ripristinare (nessuna dipendenza da Spring). */
final class VerificaCopia {

    /** Motivo gia' scritto per l'utente. */
    static final class CopiaNonValida extends Exception {
        CopiaNonValida(String messaggio) {
            super(messaggio);
        }
    }

    private VerificaCopia() {
    }

    /**
     * Apre il file in sola lettura con sqlite-jdbc, verifica {@code PRAGMA integrity_check = ok} e la
     * presenza delle tabelle {@code movimento} e {@code databasechangelog}.
     *
     * @return gli id dei changeset Liquibase registrati nella copia
     */
    static Set<String> controlla(Path file) throws CopiaNonValida {
        SQLiteConfig config = new SQLiteConfig();
        config.setReadOnly(true);
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + file, config.toProperties());
             Statement s = c.createStatement()) {
            try (ResultSet r = s.executeQuery("PRAGMA integrity_check")) {
                if (!r.next() || !"ok".equalsIgnoreCase(r.getString(1))) {
                    throw new CopiaNonValida("La copia è danneggiata (controllo di integrità non superato).");
                }
            }
            Set<String> tabelle = new HashSet<>();
            try (ResultSet r = s.executeQuery("SELECT name FROM sqlite_master WHERE type = 'table'")) {
                while (r.next()) {
                    tabelle.add(r.getString(1).toLowerCase(Locale.ROOT));
                }
            }
            if (!tabelle.contains("movimento") || !tabelle.contains("databasechangelog")) {
                throw new CopiaNonValida("Il file non è una copia di questo programma (mancano le tabelle dei dati).");
            }
            Set<String> ids = new HashSet<>();
            try (ResultSet r = s.executeQuery("SELECT id FROM databasechangelog")) {
                while (r.next()) {
                    ids.add(r.getString(1));
                }
            }
            return ids;
        } catch (SQLException e) {
            throw new CopiaNonValida("Il file non si apre come database: la copia è danneggiata o non è una copia valida.");
        }
    }
}
