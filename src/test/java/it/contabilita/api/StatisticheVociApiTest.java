package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** GET /api/statistiche/voci (docs/api.md, «Statistiche per voce»). */
class StatisticheVociApiTest extends ProvaBase {

    long bel;

    @BeforeEach
    void dati() throws Exception {
        crea(movimento("2026-10-01", "COSTO_VARIABILE", "FATTURA", 10000).put("fornitore", "Bel Fungo").put("categoria", "Farine"));
        crea(movimento("2026-11-02", "COSTO_VARIABILE", "FATTURA", 2000).put("fornitore", "Altro").put("categoria", "Farine"));
        crea(movimento("2026-10-03", "COSTO_VARIABILE", "SCONTRINO", 500).put("fornitore", "Bel Fungo"));
        crea(movimento("2026-11-04", "COSTO_VARIABILE", "NOTA_DI_CREDITO", 1000).put("fornitore", "Bel Fungo").put("categoria", "Farine"));
        crea(movimento("2026-10-05", "COSTO_VARIABILE", "SCONTRINO", 300));
        crea(retribuzione("2026-10-06", "RETRIBUZIONE_REGOLARE", 150000).put("dipendente", "Mario"));
        crea(retribuzione("2026-11-07", "RETRIBUZIONE_EXTRA", 20000));
        crea(retribuzione("2026-11-07", "RETRIBUZIONE_EXTRA", 5000).put("dipendente", "Mario"));
        crea(movimento("2026-10-08", "COSTO_FISSO", "NESSUNO", 70000).put("categoria", "Affitto"));
        crea(movimento("2026-10-09", "RICAVO", "RICAVO_EXTRA", 9000));
        bel = jdbc.queryForObject("SELECT id FROM fornitore WHERE nome = 'Bel Fungo'", Long.class);
    }

    private JsonNode voci(String query) throws Exception {
        return leggi("/api/statistiche/voci?da=2026-10-01&a=2026-11-30&" + query);
    }

    private static JsonNode voce(JsonNode r, String nome) {
        for (JsonNode v : r.get("voci")) {
            if (nome.equals(v.get("nome").asText())) {
                return v;
            }
        }
        throw new AssertionError("voce non trovata: " + nome);
    }

    @Test
    void fornitoreDiDefaultSoloCostiVariabiliConSenzaFornitoreInFondo() throws Exception {
        JsonNode r = voci("raggruppa=FORNITORE");
        assertThat(r.get("raggruppa").asText()).isEqualTo("FORNITORE");
        assertThat(r.get("tipo").asText()).isEqualTo("COSTO_VARIABILE");
        assertThat(r.get("da").asText()).isEqualTo("2026-10-01");
        assertThat(r.get("a").asText()).isEqualTo("2026-11-30");
        assertThat(r.get("voci")).hasSize(3);
        JsonNode b = r.get("voci").get(0);
        assertThat(b.get("id").asLong()).isEqualTo(bel);
        assertThat(b.get("nome").asText()).isEqualTo("Bel Fungo");
        assertThat(b.get("totaleCent").asLong()).isEqualTo(9500); // la nota di credito riduce
        assertThat(b.get("movimenti").asInt()).isEqualTo(3);
        assertThat(b.get("regolareCent").asLong()).isZero();
        assertThat(b.get("extraCent").asLong()).isZero();
        assertThat(b.get("pagataCent").asLong()).isZero();
        assertThat(b.get("fattureCent").asLong()).isEqualTo(9000); // 10000 di fattura - 1000 di nota; lo scontrino non conta
        assertThat(b.get("fatturePerMese")).extracting(JsonNode::asLong).containsExactly(10000L, -1000L);
        assertThat(b.get("pagataPerMese")).extracting(JsonNode::asLong).containsExactly(0L, 0L);
        assertThat(r.get("voci").get(1).get("fattureCent").asLong()).isEqualTo(2000);
        assertThat(r.get("voci").get(1).get("fatturePerMese")).extracting(JsonNode::asLong).containsExactly(0L, 2000L);
        assertThat(r.get("voci").get(2).get("fattureCent").asLong()).isZero(); // solo uno scontrino
        assertThat(r.get("voci").get(1).get("nome").asText()).isEqualTo("Altro");
        assertThat(r.get("voci").get(1).get("totaleCent").asLong()).isEqualTo(2000);
        JsonNode senza = r.get("voci").get(2);
        assertThat(senza.get("id").isNull()).isTrue();
        assertThat(senza.get("nome").asText()).isEqualTo("Senza fornitore");
        assertThat(senza.get("totaleCent").asLong()).isEqualTo(300);
        assertThat(r.get("totaleCent").asLong()).isEqualTo(11800);
        assertThat(r.get("movimenti").asInt()).isEqualTo(5);
    }

    @Test
    void pagataCentSommaLeFatturePagateDelFornitore() throws Exception {
        long fattura = jdbc.queryForObject("SELECT id FROM movimento WHERE importo_cent = 10000", Long.class);
        long scontrino = jdbc.queryForObject("SELECT id FROM movimento WHERE importo_cent = 500", Long.class);
        invia(put("/api/movimenti/" + fattura + "/pagata"), "{\"pagata\":true}", 200);
        // anche una nota di credito o uno scontrino non diventano "pagati"
        errore(put("/api/movimenti/" + scontrino + "/pagata"), "{\"pagata\":true}", 400);
        JsonNode r = voci("raggruppa=FORNITORE");
        assertThat(voce(r, "Bel Fungo").get("pagataCent").asLong()).isEqualTo(10000);
        assertThat(voce(r, "Bel Fungo").get("totaleCent").asLong()).isEqualTo(9500);
        // resta da pagare fatture - pagata (negativo = credito): qui 9000 - 10000
        assertThat(voce(r, "Bel Fungo").get("fattureCent").asLong()).isEqualTo(9000);
        assertThat(voce(r, "Bel Fungo").get("pagataPerMese")).extracting(JsonNode::asLong).containsExactly(10000L, 0L);
        assertThat(voce(r, "Bel Fungo").get("fatturePerMese")).extracting(JsonNode::asLong).containsExactly(10000L, -1000L);
        assertThat(voce(r, "Altro").get("pagataCent").asLong()).isZero();
        assertThat(voce(r, "Altro").get("pagataPerMese")).extracting(JsonNode::asLong).containsExactly(0L, 0L);
        assertThat(voce(r, "Senza fornitore").get("pagataCent").asLong()).isZero();
    }

    @Test
    void fattureEPagatoPerMeseSonoLunghiComeMesiESommanoAiTotali() throws Exception {
        long fattura = jdbc.queryForObject("SELECT id FROM movimento WHERE importo_cent = 2000", Long.class);
        invia(put("/api/movimenti/" + fattura + "/pagata"), "{\"pagata\":true}", 200);
        JsonNode r = leggi("/api/statistiche/voci?da=2026-09-15&a=2026-12-02&raggruppa=FORNITORE");
        assertThat(voce(r, "Bel Fungo").get("fatturePerMese")).extracting(JsonNode::asLong).containsExactly(0L, 10000L, -1000L, 0L);
        assertThat(voce(r, "Altro").get("pagataPerMese")).extracting(JsonNode::asLong).containsExactly(0L, 0L, 2000L, 0L);
        r.get("voci").forEach(v -> {
            for (String[] c : new String[][]{{"fatturePerMese", "fattureCent"}, {"pagataPerMese", "pagataCent"}}) {
                assertThat(v.get(c[0])).hasSize(4);
                long somma = 0;
                for (JsonNode x : v.get(c[0])) {
                    somma += x.asLong();
                }
                assertThat(somma).isEqualTo(v.get(c[1]).asLong());
            }
        });
    }

    @Test
    void pagataCentEsisteSoloPerIFornitori() throws Exception {
        for (String g : new String[]{"CATEGORIA", "DIPENDENTE"}) {
            JsonNode voci = voci("raggruppa=" + g).get("voci");
            assertThat(voci).isNotEmpty();
            voci.forEach(v -> {
                assertThat(v.get("pagataCent").isNull()).isTrue();
                assertThat(v.get("fattureCent").isNull()).isTrue();
                assertThat(v.get("pagataPerMese").isNull()).isTrue();
                assertThat(v.get("fatturePerMese").isNull()).isTrue();
            });
        }
    }

    @Test
    void mesiEPerMeseSonoTuttiIMesiDelPeriodo() throws Exception {
        JsonNode r = leggi("/api/statistiche/voci?da=2026-09-15&a=2026-12-02&raggruppa=FORNITORE");
        assertThat(r.get("mesi")).extracting(JsonNode::asText).containsExactly("2026-09", "2026-10", "2026-11", "2026-12");
        JsonNode b = voce(r, "Bel Fungo");
        assertThat(b.get("perMese")).extracting(JsonNode::asLong).containsExactly(0L, 10500L, -1000L, 0L);
        r.get("voci").forEach(v -> {
            long somma = 0;
            for (JsonNode x : v.get("perMese")) {
                somma += x.asLong();
            }
            assertThat(somma).isEqualTo(v.get("totaleCent").asLong());
        });
    }

    @Test
    void movimentiPerMeseContaIMovimentiDiOgniMeseInTuttiIRaggruppamenti() throws Exception {
        JsonNode f = leggi("/api/statistiche/voci?da=2026-09-15&a=2026-12-02&raggruppa=FORNITORE");
        // Bel Fungo: fattura e scontrino a ottobre, nota di credito a novembre (la nota conta come movimento)
        assertThat(voce(f, "Bel Fungo").get("movimentiPerMese")).extracting(JsonNode::asInt).containsExactly(0, 2, 1, 0);
        for (String raggruppa : new String[] {"FORNITORE", "DIPENDENTE", "CATEGORIA"}) {
            JsonNode r = voci("raggruppa=" + raggruppa);
            assertThat(r.get("voci")).isNotEmpty();
            r.get("voci").forEach(v -> {
                assertThat(v.get("movimentiPerMese")).as(raggruppa).hasSize(r.get("mesi").size());
                int somma = 0;
                for (JsonNode x : v.get("movimentiPerMese")) {
                    somma += x.asInt();
                }
                assertThat(somma).as(raggruppa).isEqualTo(v.get("movimenti").asInt());
            });
        }
        assertThat(voce(voci("raggruppa=DIPENDENTE"), "Mario").get("movimentiPerMese")).extracting(JsonNode::asInt).containsExactly(1, 1);
    }

    @Test
    void ilPeriodoLimitaIMovimentiConDateInclusive() throws Exception {
        JsonNode r = leggi("/api/statistiche/voci?da=2026-10-03&a=2026-10-05&raggruppa=FORNITORE");
        assertThat(r.get("mesi")).extracting(JsonNode::asText).containsExactly("2026-10");
        assertThat(r.get("voci")).hasSize(2);
        assertThat(voce(r, "Bel Fungo").get("totaleCent").asLong()).isEqualTo(500);
        assertThat(voce(r, "Senza fornitore").get("totaleCent").asLong()).isEqualTo(300);
        assertThat(r.get("movimenti").asInt()).isEqualTo(2);
    }

    @Test
    void dipendenteConsideraSoloLeRetribuzioniEIgnoraTipo() throws Exception {
        JsonNode r = voci("raggruppa=DIPENDENTE");
        assertThat(r.get("voci")).hasSize(2);
        JsonNode mario = r.get("voci").get(0);
        assertThat(mario.get("nome").asText()).isEqualTo("Mario");
        assertThat(mario.get("totaleCent").asLong()).isEqualTo(155000);
        assertThat(mario.get("regolareCent").asLong()).isEqualTo(150000);
        assertThat(mario.get("extraCent").asLong()).isEqualTo(5000);
        assertThat(mario.get("movimenti").asInt()).isEqualTo(2);
        JsonNode senza = r.get("voci").get(1);
        assertThat(senza.get("id").isNull()).isTrue();
        assertThat(senza.get("nome").asText()).isEqualTo("Senza dipendente");
        assertThat(senza.get("totaleCent").asLong()).isEqualTo(20000);
        assertThat(senza.get("extraCent").asLong()).isEqualTo(20000);
        assertThat(senza.get("regolareCent").asLong()).isZero();
        assertThat(r.get("totaleCent").asLong()).isEqualTo(175000);
        assertThat(r.get("movimenti").asInt()).isEqualTo(3); // l'affitto non c'e', nemmeno in "Senza dipendente"
        // tipo non si usa
        assertThat(voci("raggruppa=DIPENDENTE&tipo=RICAVO")).isEqualTo(r);
        assertThat(voci("raggruppa=DIPENDENTE&tipo=COSTO_VARIABILE").get("totaleCent").asLong()).isEqualTo(175000);
    }

    @Test
    void categoriaDiDefaultTuttiITipi() throws Exception {
        JsonNode r = voci("raggruppa=CATEGORIA");
        assertThat(r.get("voci")).extracting(v -> v.get("nome").asText())
                .containsExactly("Retribuzione", "Affitto", "Farine", "Senza categoria");
        assertThat(voce(r, "Retribuzione").get("totaleCent").asLong()).isEqualTo(175000);
        assertThat(voce(r, "Affitto").get("totaleCent").asLong()).isEqualTo(70000);
        assertThat(voce(r, "Farine").get("totaleCent").asLong()).isEqualTo(11000);
        assertThat(voce(r, "Farine").get("movimenti").asInt()).isEqualTo(3);
        JsonNode senza = voce(r, "Senza categoria");
        assertThat(senza.get("id").isNull()).isTrue();
        assertThat(senza.get("totaleCent").asLong()).isEqualTo(9800); // 9000 di ricavo + 500 + 300
        assertThat(r.get("voci").get(3).get("id").isNull()).isTrue();
        assertThat(r.get("tipo").isNull()).isTrue();
        assertThat(r.get("movimenti").asInt()).isEqualTo(10);
    }

    @Test
    void ilTipoRestringeLeVoci() throws Exception {
        JsonNode costi = voci("raggruppa=CATEGORIA&tipo=COSTI");
        assertThat(costi.get("tipo").asText()).isEqualTo("COSTI");
        assertThat(costi.get("movimenti").asInt()).isEqualTo(9);
        assertThat(voce(costi, "Senza categoria").get("totaleCent").asLong()).isEqualTo(800);
        JsonNode ricavi = voci("raggruppa=CATEGORIA&tipo=RICAVO");
        assertThat(ricavi.get("voci")).singleElement().satisfies(v -> assertThat(v.get("totaleCent").asLong()).isEqualTo(9000));
        JsonNode fissi = voci("raggruppa=CATEGORIA&tipo=COSTO_FISSO");
        assertThat(fissi.get("totaleCent").asLong()).isEqualTo(70000 + 175000);
        // fornitore con tutti i costi: i costi fissi finiscono in "Senza fornitore"
        JsonNode f = voci("raggruppa=FORNITORE&tipo=COSTI");
        assertThat(voce(f, "Senza fornitore").get("totaleCent").asLong()).isEqualTo(300 + 70000 + 175000);
        JsonNode fr = voci("raggruppa=FORNITORE&tipo=RICAVO");
        assertThat(fr.get("voci")).singleElement().satisfies(v -> assertThat(v.get("nome").asText()).isEqualTo("Senza fornitore"));
    }

    @Test
    void ilFiltroSediLimitaITotali() throws Exception {
        long seconda = creaSede("Seconda");
        crea(inSede(movimento("2026-10-10", "COSTO_VARIABILE", "SCONTRINO", 777).put("fornitore", "Bel Fungo"), seconda));
        JsonNode r = voci("raggruppa=FORNITORE&sedi=" + seconda);
        assertThat(r.get("voci")).singleElement().satisfies(v -> {
            assertThat(v.get("nome").asText()).isEqualTo("Bel Fungo");
            assertThat(v.get("totaleCent").asLong()).isEqualTo(777);
        });
        assertThat(voce(voci("raggruppa=FORNITORE&sedi=1"), "Bel Fungo").get("totaleCent").asLong()).isEqualTo(9500);
        assertThat(voce(voci("raggruppa=FORNITORE"), "Bel Fungo").get("totaleCent").asLong()).isEqualTo(9500 + 777);
    }

    @Test
    void unPeriodoSenzaMovimentiDaVociVuote() throws Exception {
        JsonNode r = leggi("/api/statistiche/voci?da=2025-01-01&a=2025-02-28&raggruppa=CATEGORIA");
        assertThat(r.get("voci")).isEmpty();
        assertThat(r.get("totaleCent").asLong()).isZero();
        assertThat(r.get("movimenti").asInt()).isZero();
        assertThat(r.get("mesi")).extracting(JsonNode::asText).containsExactly("2025-01", "2025-02");
    }

    @Test
    void unaVoceACostoZeroCompareComunque() throws Exception {
        crea(movimento("2026-10-12", "COSTO_VARIABILE", "FATTURA", 400).put("fornitore", "Pari"));
        crea(movimento("2026-10-13", "COSTO_VARIABILE", "NOTA_DI_CREDITO", 400).put("fornitore", "Pari"));
        JsonNode p = voce(voci("raggruppa=FORNITORE"), "Pari");
        assertThat(p.get("totaleCent").asLong()).isZero();
        assertThat(p.get("movimenti").asInt()).isEqualTo(2);
    }

    @Test
    void ordinePerTotaleDecrescenteEANomeAParita() throws Exception {
        crea(movimento("2026-10-12", "COSTO_VARIABILE", "SCONTRINO", 2000).put("fornitore", "Zeta"));
        crea(movimento("2026-10-12", "COSTO_VARIABILE", "SCONTRINO", 2000).put("fornitore", "alfa"));
        JsonNode r = voci("raggruppa=FORNITORE");
        assertThat(r.get("voci")).extracting(v -> v.get("nome").asText())
                .containsExactly("Bel Fungo", "alfa", "Altro", "Zeta", "Senza fornitore");
    }

    @Test
    void lePrimeEsattamenteCoerentiConIFiltriDiMovimenti() throws Exception {
        JsonNode r = voci("raggruppa=FORNITORE");
        for (JsonNode v : r.get("voci")) {
            String filtro = v.get("id").isNull() ? "senza=FORNITORE" : "fornitore=" + v.get("id").asLong();
            JsonNode elenco = leggi("/api/movimenti?da=2026-10-01&a=2026-11-30&tipo=COSTO_VARIABILE&" + filtro);
            long somma = 0;
            for (JsonNode m : elenco.get("elementi")) {
                somma += m.get("documento").asText().equals("NOTA_DI_CREDITO") ? -m.get("importoCent").asLong() : m.get("importoCent").asLong();
            }
            assertThat(somma).isEqualTo(v.get("totaleCent").asLong());
            assertThat(elenco.get("elementi")).hasSize(v.get("movimenti").asInt());
            assertThat(elenco.get("totali").get("costiCent").asLong()).isEqualTo(v.get("totaleCent").asLong());
        }
        JsonNode d = voci("raggruppa=DIPENDENTE");
        JsonNode senza = d.get("voci").get(1);
        JsonNode elenco = leggi("/api/movimenti?da=2026-10-01&a=2026-11-30&senza=DIPENDENTE&retribuzione=true");
        assertThat(elenco.get("elementi")).hasSize(senza.get("movimenti").asInt());
        assertThat(elenco.get("totali").get("costiCent").asLong()).isEqualTo(senza.get("totaleCent").asLong());
    }

    @Test
    void erroriDiValidazione() throws Exception {
        String base = "/api/statistiche/voci";
        errore(get(base + "?a=2026-11-30&raggruppa=FORNITORE"), null, 400);
        errore(get(base + "?da=2026-10-01&raggruppa=FORNITORE"), null, 400);
        errore(get(base + "?da=2026-10-01&a=2026-11-30"), null, 400);
        errore(get(base + "?da=2026-10-01&a=2026-11-30&raggruppa=SEDE"), null, 400);
        errore(get(base + "?da=2026-10-01&a=2026-11-30&raggruppa=FORNITORE&tipo=BOH"), null, 400);
        errore(get(base + "?da=2026-12-01&a=2026-11-30&raggruppa=FORNITORE"), null, 400);
        errore(get(base + "?da=ieri&a=2026-11-30&raggruppa=FORNITORE"), null, 400);
        errore(get(base + "?da=2026-10-01&a=2026-11-30&raggruppa=FORNITORE&sedi=abc"), null, 400);
        // tipo non valido e' un errore anche se poi non si usa
        errore(get(base + "?da=2026-10-01&a=2026-11-30&raggruppa=DIPENDENTE&tipo=BOH"), null, 400);
    }
}
