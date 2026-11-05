package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/** I filtri per voce di GET /api/movimenti: fornitore, dipendente, categorie, senza, retribuzione (docs/api.md). */
class FiltriPerVoceApiTest extends ProvaBase {

    long bel;
    long altro;
    long mario;
    long farine;

    @BeforeEach
    void dati() throws Exception {
        // 1 fattura Bel Fungo, farine; 2 fattura Altro, farine; 3 scontrino Bel Fungo senza categoria;
        // 4 nota di credito Bel Fungo, farine; 5 scontrino senza fornitore, senza categoria
        crea(movimento("2026-10-01", "COSTO_VARIABILE", "FATTURA", 10000).put("fornitore", "Bel Fungo").put("categoria", "Farine"));
        crea(movimento("2026-10-02", "COSTO_VARIABILE", "FATTURA", 2000).put("fornitore", "Altro").put("categoria", "Farine"));
        crea(movimento("2026-10-03", "COSTO_VARIABILE", "SCONTRINO", 500).put("fornitore", "Bel Fungo"));
        crea(movimento("2026-10-04", "COSTO_VARIABILE", "NOTA_DI_CREDITO", 1000).put("fornitore", "Bel Fungo").put("categoria", "Farine"));
        crea(movimento("2026-10-05", "COSTO_VARIABILE", "SCONTRINO", 300));
        // retribuzioni: una con dipendente, una senza; un costo fisso non retribuzione senza dipendente
        crea(retribuzione("2026-10-06", "RETRIBUZIONE_REGOLARE", 150000).put("dipendente", "Mario"));
        crea(retribuzione("2026-10-07", "RETRIBUZIONE_EXTRA", 20000));
        crea(movimento("2026-10-08", "COSTO_FISSO", "NESSUNO", 70000).put("categoria", "Affitto"));
        // un ricavo
        crea(movimento("2026-10-09", "RICAVO", "RICAVO_EXTRA", 9000));
        bel = jdbc.queryForObject("SELECT id FROM fornitore WHERE nome = 'Bel Fungo'", Long.class);
        altro = jdbc.queryForObject("SELECT id FROM fornitore WHERE nome = 'Altro'", Long.class);
        mario = jdbc.queryForObject("SELECT id FROM dipendente WHERE nome = 'Mario'", Long.class);
        farine = jdbc.queryForObject("SELECT id FROM categoria WHERE nome = 'Farine'", Long.class);
    }

    private List<Long> importi(String query) throws Exception {
        List<Long> r = new ArrayList<>();
        leggi("/api/movimenti" + query).get("elementi").forEach(m -> r.add(m.get("importoCent").asLong()));
        return r;
    }

    @Test
    void fornitoreTieneSoloQuelloEIDatiSonoCoerentiConLeStatistiche() throws Exception {
        assertThat(importi("?fornitore=" + bel)).containsExactlyInAnyOrder(10000L, 500L, 1000L);
        JsonNode r = leggi("/api/movimenti?fornitore=" + bel);
        assertThat(r.get("totali").get("costiCent").asLong()).isEqualTo(10000 + 500 - 1000);
        assertThat(importi("?fornitore=" + altro)).containsExactly(2000L);
        assertThat(importi("?fornitore=9999")).isEmpty();
        assertThat(leggi("/api/movimenti?fornitore=9999").get("totali").get("costiCent").asLong()).isZero();
    }

    @Test
    void dipendenteGiaEsistenteFunzionaInAndConIlResto() throws Exception {
        assertThat(importi("?dipendente=" + mario)).containsExactly(150000L);
        assertThat(importi("?dipendente=" + mario + "&da=2026-10-07")).isEmpty();
    }

    @Test
    void senzaFornitoreDipendenteCategoria() throws Exception {
        assertThat(importi("?senza=FORNITORE&tipo=COSTO_VARIABILE")).containsExactly(300L);
        assertThat(importi("?senza=FORNITORE")).containsExactlyInAnyOrder(300L, 150000L, 20000L, 70000L, 9000L);
        assertThat(importi("?senza=DIPENDENTE&retribuzione=true")).containsExactly(20000L);
        assertThat(importi("?senza=CATEGORIA")).containsExactlyInAnyOrder(500L, 300L, 9000L);
    }

    @Test
    void retribuzioneTrueTieneSoloLeRetribuzioni() throws Exception {
        assertThat(importi("?retribuzione=true")).containsExactlyInAnyOrder(150000L, 20000L);
        assertThat(leggi("/api/movimenti?retribuzione=true").get("totali").get("costiCent").asLong()).isEqualTo(170000);
        assertThat(importi("?retribuzione=false")).hasSize(9); // false = nessun filtro
    }

    @Test
    void combinazioniInAnd() throws Exception {
        assertThat(importi("?fornitore=" + bel + "&categorie=" + farine)).containsExactlyInAnyOrder(10000L, 1000L);
        assertThat(importi("?fornitore=" + bel + "&senza=CATEGORIA")).containsExactly(500L);
        assertThat(importi("?fornitore=" + bel + "&da=2026-10-02&a=2026-10-03")).containsExactly(500L);
        assertThat(importi("?fornitore=" + bel + "&dipendente=" + mario)).isEmpty();
        assertThat(importi("?fornitore=" + bel + "&pagata=false")).containsExactly(10000L);
        assertThat(importi("?categorie=" + farine + "&pagata=false")).containsExactlyInAnyOrder(10000L, 2000L);
        assertThat(importi("?senza=FORNITORE&tipo=COSTO_VARIABILE&q=zzz")).isEmpty();
    }

    @Test
    void sediInAndConIFiltriPerVoce() throws Exception {
        long seconda = creaSede("Seconda");
        crea(inSede(movimento("2026-10-10", "COSTO_VARIABILE", "SCONTRINO", 777).put("fornitore", "Bel Fungo"), seconda));
        assertThat(importi("?fornitore=" + bel + "&sedi=" + seconda)).containsExactly(777L);
        assertThat(importi("?fornitore=" + bel + "&sedi=1")).containsExactlyInAnyOrder(10000L, 500L, 1000L);
    }

    @Test
    void valoriNonValidiDa400() throws Exception {
        errore(get("/api/movimenti?fornitore=abc"), null, 400);
        errore(get("/api/movimenti?dipendente=abc"), null, 400);
        errore(get("/api/movimenti?senza=ALTRO"), null, 400);
        assertThat(importi("?senza=")).hasSize(9); // vuoto = nessun filtro, come categorie
        errore(get("/api/movimenti?retribuzione=forse"), null, 400);
        errore(get("/api/movimenti?pagata=boh"), null, 400);
        errore(get("/api/movimenti?categorie=abc"), null, 400);
    }

    @Test
    void categorieESenzaCategoriaInsiemeDa400() throws Exception {
        errore(get("/api/movimenti?categorie=" + farine + "&senza=CATEGORIA"), null, 400);
        // con un altro "senza" va bene
        assertThat(importi("?categorie=" + farine + "&senza=DIPENDENTE")).hasSize(3);
    }
}
