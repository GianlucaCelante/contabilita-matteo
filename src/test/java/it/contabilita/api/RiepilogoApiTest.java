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
        crea(movimento("2026-03-27", "COSTO_FISSO", "RETRIBUZIONE_REGOLARE", 80000));
        crea(movimento("2026-03-27", "COSTO_FISSO", "RETRIBUZIONE_EXTRA", 20000));
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
        assertThat(fissi.get("altreVoci")).hasSize(2);
        assertThat(fissi.get("altreVoci").get(0).get("categoria").asText()).isEqualTo("Affitto");
        assertThat(fissi.get("altreVoci").get(0).get("importoCent").asLong()).isEqualTo(60500);
        assertThat(fissi.get("altreVoci").get(1).get("categoria").asText()).isEqualTo("Altre voci fisse");
        assertThat(fissi.get("altreVoci").get(1).get("importoCent").asLong()).isEqualTo(1000);
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

    /**
     * Ricavi: fatturati 100000, Delivery 30000 + 12000 (personalizzata). Costi variabili: fattura «Farine» 20000 con
     * categoria predefinita (inserita a mano nel database di prova: il backend non ne ha fra i costi variabili),
     * scontrino senza categoria 1500, Imballaggi 8000 - nota 3000, Bibite 900. Le categorie personalizzate vanno nella
     * loro riga e non in Fatture/Scontrini/Extra/Fatturati; i totali sono quelli di sempre.
     */
    @Test
    void leCategoriePersonalizzateHannoLaLoroRigaETotaliInvariati() throws Exception {
        crea(movimento("2026-03-01", "RICAVO", "RICAVO_FATTURATO", 100000));
        crea(conCategoria(movimento("2026-03-02", "RICAVO", "RICAVO_EXTRA", 30000), "Delivery"));
        crea(conCategoria(movimento("2026-03-03", "RICAVO", "RICAVO_FATTURATO", 12000), "delivery"));
        jdbc.update("INSERT INTO categoria (nome, nome_chiave, tipo, personalizzata) VALUES ('Farine', 'farine', 'COSTO_VARIABILE', 0)");
        crea(conCategoria(movimento("2026-03-04", "COSTO_VARIABILE", "FATTURA", 20000), "Farine")); // predefinita: resta in «Fatture»
        crea(movimento("2026-03-05", "COSTO_VARIABILE", "SCONTRINO", 1500)); // idem, «Scontrini»
        crea(conCategoria(movimento("2026-03-06", "COSTO_VARIABILE", "FATTURA", 8000), "Imballaggi"));
        crea(conCategoria(movimento("2026-03-07", "COSTO_VARIABILE", "NOTA_DI_CREDITO", 3000), "Imballaggi"));
        crea(conCategoria(movimento("2026-03-08", "COSTO_VARIABILE", "SCONTRINO", 900), "Bibite"));
        crea(conCategoria(movimento("2026-03-09", "COSTO_FISSO", "NESSUNO", 60000), "Affitto"));
        crea(conCategoria(movimento("2026-03-10", "COSTO_FISSO", "NESSUNO", 4000), "Commercialista")); // fisso: come prima

        JsonNode r = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31");
        JsonNode ricavi = r.get("ricavi");
        assertThat(ricavi.get("fatturatiCent").asLong()).isEqualTo(100000);
        assertThat(ricavi.get("extraCent").asLong()).isZero();
        assertThat(ricavi.get("altreVoci")).hasSize(1);
        assertThat(ricavi.get("altreVoci").get(0).get("categoria").asText()).isEqualTo("Delivery");
        assertThat(ricavi.get("altreVoci").get(0).get("importoCent").asLong()).isEqualTo(42000);
        assertThat(ricavi.get("totaleCent").asLong()).isEqualTo(142000);

        JsonNode variabili = r.get("costiVariabili");
        assertThat(variabili.get("fattureCent").asLong()).isEqualTo(20000);
        assertThat(variabili.get("scontriniCent").asLong()).isEqualTo(1500);
        assertThat(variabili.get("altreVoci")).hasSize(2);
        assertThat(variabili.get("altreVoci").get(0).get("categoria").asText()).isEqualTo("Imballaggi");
        assertThat(variabili.get("altreVoci").get(0).get("importoCent").asLong()).isEqualTo(5000); // 8000 - nota 3000
        assertThat(variabili.get("altreVoci").get(1).get("categoria").asText()).isEqualTo("Bibite");
        assertThat(variabili.get("altreVoci").get(1).get("importoCent").asLong()).isEqualTo(900);
        assertThat(variabili.get("totaleCent").asLong()).isEqualTo(27400);

        JsonNode fissi = r.get("costiFissi");
        assertThat(fissi.get("altreVoci")).hasSize(2);
        assertThat(fissi.get("totaleCent").asLong()).isEqualTo(64000);
        // gli stessi totali di prima della regola: 142000 ricavi, 27400 + 64000 costi
        assertThat(r.get("costiCent").asLong()).isEqualTo(91400);
        assertThat(r.get("risultatoCent").asLong()).isEqualTo(50600);

        // la ripartizione per sede non cambia
        JsonNode sede = r.get("perSede").get(0);
        assertThat(sede.get("ricaviCent").asLong()).isEqualTo(142000);
        assertThat(sede.get("costiCent").asLong()).isEqualTo(91400);
        // e l'elenco dei movimenti ha gli stessi totali
        assertThat(leggi("/api/movimenti?da=2026-03-01&a=2026-03-31").get("totali").get("saldoCent").asLong()).isEqualTo(50600);
    }

    @Test
    void conIlFiltroSediLeRigheDiCategoriaSeguonoLeSedi() throws Exception {
        long mare = creaSede("Sede Mare");
        crea(inSede(conCategoria(movimento("2026-03-02", "RICAVO", "RICAVO_EXTRA", 30000), "Delivery"), 1));
        crea(inSede(conCategoria(movimento("2026-03-03", "RICAVO", "RICAVO_EXTRA", 5000), "Delivery"), mare));
        JsonNode r = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31&sedi=" + mare);
        assertThat(r.get("ricavi").get("altreVoci").get(0).get("importoCent").asLong()).isEqualTo(5000);
        assertThat(r.get("ricavi").get("totaleCent").asLong()).isEqualTo(5000);
        JsonNode tutte = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31");
        assertThat(tutte.get("ricavi").get("altreVoci").get(0).get("importoCent").asLong()).isEqualTo(35000);
    }

    @Test
    void ilPeriodoSiRestringeEUnPeriodoVuotoDaTuttoZero() throws Exception {
        inserisciSet();
        JsonNode giorno = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-01");
        assertThat(giorno.get("ricavi").get("totaleCent").asLong()).isEqualTo(100000);
        assertThat(giorno.get("costiCent").asLong()).isZero();
        assertThat(giorno.get("risultatoCent").asLong()).isEqualTo(100000);

        JsonNode vuoto = leggi("/api/riepilogo?da=2025-01-01&a=2025-01-31");
        assertThat(vuoto.get("costiFissi").get("altreVoci")).isEmpty();
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
