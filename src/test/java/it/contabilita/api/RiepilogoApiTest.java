package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * Riepilogo verificato a mano su un set piccolo (marzo 2026, importi in centesimi):
 * <pre>
 * Ricavi:           fatturati 100000 + extra 25050                    = 125050
 * Costi variabili:  fatture 30000 + scontrini 4550                    =  34550
 * Costi fissi:      retribuzione regolare 80000 + extra 20000
 *                   + Affitto (60000 + 500) + senza categoria 1000    = 161500
 * Costi = 34550 + 161500 = 196050; risultato = 125050 - 196050 = -71000 (negativo)
 * </pre>
 * Fuori periodo (28 febbraio e 1 aprile) non contano.
 */
class RiepilogoApiTest extends ProvaBase {

    private void inserisciSet() throws Exception {
        crea(movimento("2026-03-01", "RICAVO", "RICAVO_FATTURATO", 100000));
        crea(movimento("2026-03-31", "RICAVO", "RICAVO_EXTRA", 25050));
        crea(movimento("2026-03-10", "COSTO_VARIABILE", "FATTURA", 30000));
        crea(movimento("2026-03-11", "COSTO_VARIABILE", "SCONTRINO", 4550));
        crea(retribuzione("2026-03-27", "RETRIBUZIONE_REGOLARE", 80000));
        crea(retribuzione("2026-03-27", "RETRIBUZIONE_EXTRA", 20000));
        ObjectNode affitto = movimento("2026-03-05", "COSTO_FISSO", "NESSUNO", 60000);
        affitto.put("categoria", "Affitto");
        crea(affitto);
        ObjectNode affitto2 = movimento("2026-03-06", "COSTO_FISSO", "NESSUNO", 500);
        affitto2.put("categoria", "affitto");
        crea(affitto2);
        crea(movimento("2026-03-07", "COSTO_FISSO", "NESSUNO", 1000));
        // fuori periodo
        crea(movimento("2026-02-28", "COSTO_VARIABILE", "FATTURA", 99999));
        crea(movimento("2026-04-01", "RICAVO", "RICAVO_FATTURATO", 99999));
    }

    @Test
    void riepilogoDiMarzoQuadraConIlCalcoloAMano() throws Exception {
        inserisciSet();
        JsonNode r = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31");
        assertThat(r.get("da").asText()).isEqualTo("2026-03-01");
        assertThat(r.get("a").asText()).isEqualTo("2026-03-31");
        assertThat(r.get("ricavi").get("fatturatiCent").asLong()).isEqualTo(100000);
        assertThat(r.get("ricavi").get("extraCent").asLong()).isEqualTo(25050);
        assertThat(r.get("ricavi").get("totaleCent").asLong()).isEqualTo(125050);
        assertThat(r.get("costiVariabili").get("fattureCent").asLong()).isEqualTo(30000);
        assertThat(r.get("costiVariabili").get("scontriniCent").asLong()).isEqualTo(4550);
        assertThat(r.get("costiVariabili").get("totaleCent").asLong()).isEqualTo(34550);
        JsonNode fissi = r.get("costiFissi");
        assertThat(fissi.get("retribuzioneRegolareCent").asLong()).isEqualTo(80000);
        assertThat(fissi.get("retribuzioneExtraCent").asLong()).isEqualTo(20000);
        assertThat(fissi.has("altreVoci")).isFalse();
        JsonNode voci = fissi.get("voci");
        assertThat(voci).hasSize(3); // per importo: Retribuzione, Affitto, Senza categoria in fondo
        assertThat(voci.get(0).get("categoria").asText()).isEqualTo("Retribuzione");
        assertThat(voci.get(0).get("importoCent").asLong()).isEqualTo(100000);
        assertThat(voci.get(1).get("categoria").asText()).isEqualTo("Affitto");
        assertThat(voci.get(1).get("id").asLong()).isPositive();
        assertThat(voci.get(1).get("importoCent").asLong()).isEqualTo(60500);
        assertThat(voci.get(2).get("categoria").asText()).isEqualTo("Senza categoria");
        assertThat(voci.get(2).get("id").isNull()).isTrue();
        assertThat(voci.get(2).get("importoCent").asLong()).isEqualTo(1000);
        // ricavi e costi variabili senza categoria: una sola riga "Senza categoria"
        assertThat(r.get("ricavi").get("voci")).hasSize(1);
        assertThat(r.get("ricavi").get("voci").get(0).get("importoCent").asLong()).isEqualTo(125050);
        assertThat(r.get("costiVariabili").get("voci").get(0).get("categoria").asText()).isEqualTo("Senza categoria");
        assertThat(r.get("costiVariabili").get("voci").get(0).get("importoCent").asLong()).isEqualTo(34550);
        assertThat(fissi.get("totaleCent").asLong()).isEqualTo(161500);
        assertThat(r.get("costiCent").asLong()).isEqualTo(196050);
        assertThat(r.get("risultatoCent").asLong()).isEqualTo(-71000);
    }

    // Una nota di credito ricevuta riduce i costi (non e' un ricavo): fatture 30000 - nota 5000 = 25000.
    @Test
    void laNotaDiCreditoRiduceLeFattureEICosti() throws Exception {
        crea(movimento("2026-03-10", "COSTO_VARIABILE", "FATTURA", 30000));
        crea(movimento("2026-03-12", "COSTO_VARIABILE", "NOTA_DI_CREDITO", 5000));
        crea(movimento("2026-03-11", "COSTO_VARIABILE", "SCONTRINO", 4550));
        crea(movimento("2026-03-01", "RICAVO", "RICAVO_FATTURATO", 100000));

        JsonNode r = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31");
        assertThat(r.get("costiVariabili").get("fattureCent").asLong()).isEqualTo(25000);
        assertThat(r.get("costiVariabili").get("scontriniCent").asLong()).isEqualTo(4550);
        assertThat(r.get("costiVariabili").get("totaleCent").asLong()).isEqualTo(29550);
        assertThat(r.get("costiCent").asLong()).isEqualTo(29550);
        assertThat(r.get("ricavi").get("totaleCent").asLong()).isEqualTo(100000);
        assertThat(r.get("risultatoCent").asLong()).isEqualTo(70450);

        JsonNode elenco = leggi("/api/movimenti?da=2026-03-01&a=2026-03-31");
        assertThat(elenco.get("totali").get("costiCent").asLong()).isEqualTo(29550);
        assertThat(elenco.get("totali").get("ricaviCent").asLong()).isEqualTo(100000);
        assertThat(elenco.get("totali").get("saldoCent").asLong()).isEqualTo(70450);
        assertThat(elenco.get("elementi")).extracting(e -> e.get("documento").asText()).contains("NOTA_DI_CREDITO");
        assertThat(elenco.get("elementi").get(0).get("importoCent").asLong()).isEqualTo(5000); // l'importo resta positivo
    }

    private ObjectNode conCategoria(ObjectNode m, String categoria) {
        m.put("categoria", categoria);
        return m;
    }

    private static java.util.List<String> righe(JsonNode voci) {
        java.util.List<String> out = new java.util.ArrayList<>();
        voci.forEach(v -> out.add(v.get("categoria").asText() + ":" + v.get("importoCent").asLong()));
        return out;
    }

    /**
     * Ricavi: fatturato senza categoria 100000, Delivery 30000 (extra) + 12000 (fatturato). Costi variabili: fattura
     * Farine 20000, scontrino senza categoria 1500, Imballaggi 8000 - nota 3000, Bibite 900. Ogni categoria ha la sua
     * riga, in fondo "Senza categoria"; le somme per documento sono "di cui" e contano tutto, qualunque categoria.
     */
    @Test
    void ognunaCategoriaHaLaSuaRigaELeSommePerDocumentoSonoDiCui() throws Exception {
        crea(movimento("2026-03-01", "RICAVO", "RICAVO_FATTURATO", 100000));
        crea(conCategoria(movimento("2026-03-02", "RICAVO", "RICAVO_EXTRA", 30000), "Delivery"));
        crea(conCategoria(movimento("2026-03-03", "RICAVO", "RICAVO_FATTURATO", 12000), "delivery"));
        crea(conCategoria(movimento("2026-03-04", "COSTO_VARIABILE", "FATTURA", 20000), "Farine"));
        crea(movimento("2026-03-05", "COSTO_VARIABILE", "SCONTRINO", 1500));
        crea(conCategoria(movimento("2026-03-06", "COSTO_VARIABILE", "FATTURA", 8000), "Imballaggi"));
        crea(conCategoria(movimento("2026-03-07", "COSTO_VARIABILE", "NOTA_DI_CREDITO", 3000), "Imballaggi"));
        crea(conCategoria(movimento("2026-03-08", "COSTO_VARIABILE", "SCONTRINO", 900), "Bibite"));
        crea(conCategoria(movimento("2026-03-09", "COSTO_FISSO", "NESSUNO", 60000), "Affitto"));
        crea(conCategoria(movimento("2026-03-10", "COSTO_FISSO", "NESSUNO", 4000), "Commercialista"));

        JsonNode r = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31");
        JsonNode ricavi = r.get("ricavi");
        assertThat(righe(ricavi.get("voci"))).containsExactly("Delivery:42000", "Senza categoria:100000");
        assertThat(ricavi.get("fatturatiCent").asLong()).isEqualTo(112000); // di cui: anche le categorie
        assertThat(ricavi.get("extraCent").asLong()).isEqualTo(30000);
        assertThat(ricavi.get("totaleCent").asLong()).isEqualTo(142000);

        JsonNode variabili = r.get("costiVariabili");
        assertThat(righe(variabili.get("voci"))).containsExactly("Farine:20000", "Imballaggi:5000", "Bibite:900", "Senza categoria:1500");
        assertThat(variabili.get("fattureCent").asLong()).isEqualTo(25000); // 20000 + 8000 - nota 3000
        assertThat(variabili.get("scontriniCent").asLong()).isEqualTo(2400);
        assertThat(variabili.get("totaleCent").asLong()).isEqualTo(27400);

        JsonNode fissi = r.get("costiFissi");
        assertThat(righe(fissi.get("voci"))).containsExactly("Affitto:60000", "Commercialista:4000");
        assertThat(fissi.get("retribuzioneRegolareCent").asLong()).isZero();
        assertThat(fissi.get("totaleCent").asLong()).isEqualTo(64000);
        assertThat(r.get("costiCent").asLong()).isEqualTo(91400);
        assertThat(r.get("risultatoCent").asLong()).isEqualTo(50600);

        // la ripartizione per sede non cambia
        JsonNode sede = r.get("perSede").get(0);
        assertThat(sede.get("ricaviCent").asLong()).isEqualTo(142000);
        assertThat(sede.get("costiCent").asLong()).isEqualTo(91400);
        assertThat(leggi("/api/movimenti?da=2026-03-01&a=2026-03-31").get("totali").get("saldoCent").asLong()).isEqualTo(50600);
    }

    @Test
    void laNotaDiCreditoPuoPortareNegativaLaRigaDellaSuaCategoria() throws Exception {
        crea(conCategoria(movimento("2026-03-06", "COSTO_VARIABILE", "FATTURA", 1000), "Imballaggi"));
        crea(conCategoria(movimento("2026-03-07", "COSTO_VARIABILE", "NOTA_DI_CREDITO", 3000), "Imballaggi"));
        JsonNode v = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31").get("costiVariabili");
        assertThat(righe(v.get("voci"))).containsExactly("Imballaggi:-2000");
        assertThat(v.get("totaleCent").asLong()).isEqualTo(-2000);
    }

    @Test
    void ilNomeDiUnaCategoriaRinominataSiVedeNelRiepilogo() throws Exception {
        crea(conCategoria(movimento("2026-03-02", "RICAVO", "RICAVO_EXTRA", 500), "Delivry"));
        long id = leggi("/api/categorie").get(0).get("id").asLong();
        invia(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/categorie/" + id),
                json.createObjectNode().put("nome", "Delivery"), 200);
        JsonNode v = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31").get("ricavi").get("voci").get(0);
        assertThat(v.get("id").asLong()).isEqualTo(id);
        assertThat(v.get("categoria").asText()).isEqualTo("Delivery");
    }

    @Test
    void conIlFiltroSediLeRigheDiCategoriaSeguonoLeSedi() throws Exception {
        long mare = creaSede("Sede Mare");
        crea(inSede(conCategoria(movimento("2026-03-02", "RICAVO", "RICAVO_EXTRA", 30000), "Delivery"), 1));
        crea(inSede(conCategoria(movimento("2026-03-03", "RICAVO", "RICAVO_EXTRA", 5000), "Delivery"), mare));
        JsonNode r = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31&sedi=" + mare);
        assertThat(righe(r.get("ricavi").get("voci"))).containsExactly("Delivery:5000");
        assertThat(r.get("ricavi").get("totaleCent").asLong()).isEqualTo(5000);
        JsonNode tutte = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31");
        assertThat(righe(tutte.get("ricavi").get("voci"))).containsExactly("Delivery:35000");
    }

    @Test
    void ilPeriodoSiRestringeEUnPeriodoVuotoDaTuttoZero() throws Exception {
        inserisciSet();
        JsonNode giorno = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-01");
        assertThat(giorno.get("ricavi").get("totaleCent").asLong()).isEqualTo(100000);
        assertThat(giorno.get("costiCent").asLong()).isZero();
        assertThat(giorno.get("risultatoCent").asLong()).isEqualTo(100000);

        JsonNode vuoto = leggi("/api/riepilogo?da=2025-01-01&a=2025-01-31");
        assertThat(vuoto.get("costiFissi").get("voci")).isEmpty();
        assertThat(vuoto.get("ricavi").get("voci")).isEmpty();
        assertThat(vuoto.get("risultatoCent").asLong()).isZero();
    }

    @Test
    void ledateSonoObbligatorieECoerenti() throws Exception {
        errore(get("/api/riepilogo"), null, 400);
        errore(get("/api/riepilogo?da=2026-03-01"), null, 400);
        errore(get("/api/riepilogo?a=2026-03-01"), null, 400);
        errore(get("/api/riepilogo?da=2026-04-01&a=2026-03-01"), null, 400);
        errore(get("/api/riepilogo?da=marzo&a=2026-03-01"), null, 400);
    }
}
