package it.contabilita;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Contesto Spring, migrazione/schema Liquibase, versione, servizio senza interfaccia (-Dskip.ui=true). */
class ContabilitaApplicationTests extends ProvaBase {

    @Test
    void ilContestoPartEVersioneRisponde() throws Exception {
        mockMvc.perform(get("/api/versione"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.versione").value("0.1.0"));
    }

    @Test
    void liquibaseHaCreatoLeTabelleEGliIndici() {
        List<String> tabelle = jdbc.queryForList("SELECT name FROM sqlite_master WHERE type='table'", String.class);
        assertThat(tabelle).contains("categoria", "fornitore", "dipendente", "ricorrenza", "movimento", "impostazione");
        List<String> indici = jdbc.queryForList("SELECT name FROM sqlite_master WHERE type='index'", String.class);
        assertThat(indici).contains("ix_movimento_data", "ix_movimento_tipo", "ux_movimento_ricorrenza_mese",
                "ux_categoria_nome_tipo", "ux_fornitore_nome", "ux_dipendente_nome");
        assertThat(jdbc.queryForList("SELECT id FROM databasechangelog", String.class)).hasSize(7); // 6 della versione 1 + allegato_file (fase 4)
    }

    @Test
    void lePragmaDiSQLiteSonoQuelleAttese() {
        assertThat(jdbc.queryForObject("PRAGMA journal_mode", String.class)).isEqualToIgnoringCase("wal");
    }

    @Test
    void ilVincoloUnicoImpedisceDueOccorrenzeDellaStessaRicorrenzaNelloStessoMese() {
        jdbc.update("INSERT INTO ricorrenza (giorno, attiva, tipo, documento, importo_cent, ultimo_mese, creata_il) "
                + "VALUES (5, 1, 'COSTO_FISSO', 'NESSUNO', 100, '2026-01', '2026-01-01T00:00:00')");
        Long id = jdbc.queryForObject("SELECT id FROM ricorrenza", Long.class);
        String sql = "INSERT INTO movimento (data, tipo, documento, importo_cent, origine, ricorrenza_id, anno_mese, creato_il, modificato_il) "
                + "VALUES ('2026-01-05', 'COSTO_FISSO', 'NESSUNO', 100, 'RICORRENZA', ?, '2026-01', 'x', 'x')";
        jdbc.update(sql, id);
        assertThatThrownBy(() -> jdbc.update(sql, id)).isInstanceOf(org.springframework.dao.DataAccessException.class).hasMessageContaining("UNIQUE");
        // movimenti singoli (ricorrenza nulla) possono invece ripetersi
        String singolo = "INSERT INTO movimento (data, tipo, documento, importo_cent, origine, creato_il, modificato_il) "
                + "VALUES ('2026-01-05', 'RICAVO', 'RICAVO_EXTRA', 100, 'MANO', 'x', 'x')";
        jdbc.update(singolo);
        jdbc.update(singolo);
    }

    @Test
    void senzaInterfacciaIlServizioRispondeComunqueEUnaRottaDellaSpaDa404() throws Exception {
        // con -Dskip.ui=true non c'e' index.html in classes/static: nessun errore 500, solo 404
        int stato = mockMvc.perform(get("/movimenti")).andReturn().getResponse().getStatus();
        assertThat(stato).isIn(200, 404);
        mockMvc.perform(get("/api/rotta-che-non-esiste"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errore").exists());
    }
}
