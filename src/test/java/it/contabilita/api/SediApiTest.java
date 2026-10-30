package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** Sedi: anagrafica, movimenti per sede con filtro, «dividi» e riepilogo per sede (docs/api.md, "Sedi"). */
class SediApiTest extends ProvaBase {

    private ObjectNode nome(String nome) {
        return json.createObjectNode().put("nome", nome);
    }

    private List<Long> ids(JsonNode elenco) {
        List<Long> out = new ArrayList<>();
        elenco.forEach(n -> out.add(n.get("id").asLong()));
        return out;
    }

    // ---------------------------------------------------------------- anagrafica

    @Test
    void unDatabaseNuovoHaLaSedePrincipale() throws Exception {
        JsonNode sedi = leggi("/api/sedi");
        assertThat(sedi).hasSize(1);
        assertThat(sedi.get(0).get("id").asLong()).isEqualTo(1);
        assertThat(sedi.get(0).get("nome").asText()).isEqualTo("Sede principale");
        assertThat(sedi.get(0).get("archiviata").asBoolean()).isFalse();
        assertThat(sedi.get(0).get("movimenti").asLong()).isZero();
    }

    @Test
    void creaSenzaDistinguereMaiuscoleEElencaLeAttiveInOrdineELeArchiviateInFondo() throws Exception {
        JsonNode mare = invia(post("/api/sedi"), nome("  Sede   Mare "), 201);
        assertThat(mare.get("nome").asText()).isEqualTo("Sede Mare");
        assertThat(mare.get("archiviata").asBoolean()).isFalse();
        assertThat(mare.get("movimenti").asLong()).isZero();
        // esiste gia' (maiuscole diverse): 200 con quella esistente
        JsonNode ancora = invia(post("/api/sedi"), nome("sede mare"), 200);
        assertThat(ancora.get("id").asLong()).isEqualTo(mare.get("id").asLong());
        JsonNode monti = invia(post("/api/sedi"), nome("Sede Monti"), 201);

        // archivio la principale: va in fondo
        invia(put("/api/sedi/1"), json.createObjectNode().put("archiviata", true), 200);
        JsonNode elenco = leggi("/api/sedi");
        assertThat(ids(elenco)).containsExactly(mare.get("id").asLong(), monti.get("id").asLong(), 1L);
        assertThat(elenco.get(2).get("archiviata").asBoolean()).isTrue();
    }

    @Test
    void nomeVuotoOTroppoLungoDa400() throws Exception {
        errore(post("/api/sedi"), nome("   "), 400);
        errore(post("/api/sedi"), json.createObjectNode(), 400);
        errore(post("/api/sedi"), nome("x".repeat(121)), 400);
        errore(put("/api/sedi/1"), nome(" "), 400);
    }

    @Test
    void rinominareConUnNomeDiUnAltraSedeDa409EConIlProprioNomeVaBene() throws Exception {
        long mare = creaSede("Sede Mare");
        errore(put("/api/sedi/" + mare), nome("SEDE PRINCIPALE"), 409);
        // solo cambio di maiuscole sulla stessa sede
        JsonNode r = invia(put("/api/sedi/" + mare), nome("SEDE MARE"), 200);
        assertThat(r.get("nome").asText()).isEqualTo("SEDE MARE");
        assertThat(invia(put("/api/sedi/" + mare), nome("Lido"), 200).get("nome").asText()).isEqualTo("Lido");
        // il nuovo nome vale per l'unicita'
        invia(post("/api/sedi"), nome("lido"), 200);
        errore(put("/api/sedi/999"), nome("Qualcosa"), 404);
    }

    @Test
    void nonSiPuoArchiviareLUltimaSedeAttivaMaSiPuoRiattivare() throws Exception {
        JsonNode errore = errore(put("/api/sedi/1"), json.createObjectNode().put("archiviata", true), 409);
        assertThat(errore.get("errore").asText()).isEqualTo("Non si può archiviare l'ultima sede attiva.");
        assertThat(leggi("/api/sedi").get(0).get("archiviata").asBoolean()).isFalse();

        long mare = creaSede("Sede Mare");
        invia(put("/api/sedi/1"), json.createObjectNode().put("archiviata", true), 200); // ora ce n'e' un'altra
        errore(put("/api/sedi/" + mare), json.createObjectNode().put("archiviata", true), 409); // e' l'ultima
        JsonNode riattivata = invia(put("/api/sedi/1"), json.createObjectNode().put("archiviata", false), 200);
        assertThat(riattivata.get("archiviata").asBoolean()).isFalse();
        // un corpo vuoto non cambia niente
        invia(put("/api/sedi/1"), json.createObjectNode(), 200);
    }

    @Test
    void leSediNonSiCancellanoEIlNumeroDiMovimentiSiAggiorna() throws Exception {
        long mare = creaSede("Sede Mare");
        crea(inSede(movimento("2026-03-01", "RICAVO", "RICAVO_FATTURATO", 1000), mare));
        crea(inSede(movimento("2026-03-02", "RICAVO", "RICAVO_FATTURATO", 2000), mare));
        crea(inSede(movimento("2026-03-03", "RICAVO", "RICAVO_FATTURATO", 3000), 1));
        JsonNode elenco = leggi("/api/sedi");
        assertThat(elenco.get(0).get("movimenti").asLong()).isEqualTo(1);
        assertThat(elenco.get(1).get("movimenti").asLong()).isEqualTo(2);
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/sedi/" + mare))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isMethodNotAllowed());
    }

    // ---------------------------------------------------------------- movimenti

    @Test
    void ilMovimentoHaLaSedeEIlFiltroSediRestringeElencoETotali() throws Exception {
        long mare = creaSede("Sede Mare");
        JsonNode a = crea(inSede(movimento("2026-03-01", "RICAVO", "RICAVO_FATTURATO", 10000), 1));
        crea(inSede(movimento("2026-03-02", "RICAVO", "RICAVO_EXTRA", 5000), mare));
        crea(inSede(movimento("2026-03-03", "COSTO_VARIABILE", "SCONTRINO", 700), mare));
        assertThat(a.get("sede").get("id").asLong()).isEqualTo(1);
        assertThat(a.get("sede").get("nome").asText()).isEqualTo("Sede principale");

        JsonNode tutte = leggi("/api/movimenti");
        assertThat(tutte.get("elementi")).hasSize(3);
        assertThat(tutte.get("totali").get("ricaviCent").asLong()).isEqualTo(15000);

        JsonNode soloMare = leggi("/api/movimenti?sedi=" + mare);
        assertThat(soloMare.get("elementi")).hasSize(2)
                .allSatisfy(m -> assertThat(m.get("sede").get("nome").asText()).isEqualTo("Sede Mare"));
        assertThat(soloMare.get("totali").get("ricaviCent").asLong()).isEqualTo(5000);
        assertThat(soloMare.get("totali").get("costiCent").asLong()).isEqualTo(700);
        assertThat(soloMare.get("totali").get("saldoCent").asLong()).isEqualTo(4300);

        JsonNode due = leggi("/api/movimenti?sedi=1," + mare);
        assertThat(due.get("elementi")).hasSize(3);
        assertThat(leggi("/api/movimenti?sedi=999").get("elementi")).isEmpty();
        assertThat(leggi("/api/movimenti?sedi=").get("elementi")).hasSize(3); // vuoto = tutte
        errore(get("/api/movimenti?sedi=uno"), null, 400);

        // anche archiviata, la sede resta nei filtri e nei dati
        invia(put("/api/sedi/" + mare), json.createObjectNode().put("archiviata", true), 200);
        assertThat(leggi("/api/movimenti?sedi=" + mare).get("elementi")).hasSize(2);
        assertThat(leggi("/api/movimenti").get("elementi")).hasSize(3);
    }

    @Test
    void senzaSedeIdVaLUnicaSedeAttivaConPiuSediDa400() throws Exception {
        JsonNode m = crea(movimento("2026-03-01", "RICAVO", "RICAVO_EXTRA", 1000));
        assertThat(m.get("sede").get("id").asLong()).isEqualTo(1);

        long mare = creaSede("Sede Mare");
        JsonNode errore = errore(post("/api/movimenti"), movimento("2026-03-01", "RICAVO", "RICAVO_EXTRA", 1000), 400);
        assertThat(errore.get("errore").asText()).isEqualTo("Scegli la sede: ce n'è più di una.");

        // con la principale archiviata l'unica attiva e' Mare, e si usa quella
        invia(put("/api/sedi/1"), json.createObjectNode().put("archiviata", true), 200);
        JsonNode inMare = crea(movimento("2026-03-02", "RICAVO", "RICAVO_EXTRA", 1000));
        assertThat(inMare.get("sede").get("id").asLong()).isEqualTo(mare);
        // ma su una sede archiviata o inesistente non si crea
        errore(post("/api/movimenti"), inSede(movimento("2026-03-02", "RICAVO", "RICAVO_EXTRA", 1000), 1), 400);
        errore(post("/api/movimenti"), inSede(movimento("2026-03-02", "RICAVO", "RICAVO_EXTRA", 1000), 999), 400);
    }

    @Test
    void siSpostaUnMovimentoDiSedeEUnaModificaSenzaSedeLaLasciaDovEra() throws Exception {
        long mare = creaSede("Sede Mare");
        JsonNode m = crea(inSede(movimento("2026-03-01", "RICAVO", "RICAVO_EXTRA", 1000), mare));
        long id = m.get("id").asLong();
        JsonNode invariato = modifica(id, "SOLO_QUESTO", movimento("2026-03-01", "RICAVO", "RICAVO_EXTRA", 2000));
        assertThat(invariato.get("sede").get("id").asLong()).isEqualTo(mare);
        JsonNode spostato = modifica(id, "SOLO_QUESTO", inSede(movimento("2026-03-01", "RICAVO", "RICAVO_EXTRA", 2000), 1));
        assertThat(spostato.get("sede").get("id").asLong()).isEqualTo(1);
        assertThat(leggi("/api/movimenti/" + id).get("sede").get("nome").asText()).isEqualTo("Sede principale");
    }

    @Test
    void laRipetizioneEreditaLaSedeEOgniOccorrenzaLaStessa() throws Exception {
        long mare = creaSede("Sede Mare");
        orologio.imposta("2026-03-20");
        ObjectNode affitto = inSede(movimento("2026-01-05", "COSTO_FISSO", "NESSUNO", 50000), mare);
        affitto.putObject("ricorrenza").put("giorno", 5);
        JsonNode prima = crea(affitto);
        assertThat(prima.get("sede").get("id").asLong()).isEqualTo(mare);

        JsonNode elenco = leggi("/api/movimenti?sedi=" + mare).get("elementi");
        assertThat(elenco).hasSize(3); // gennaio, febbraio, marzo
        assertThat(elenco).allSatisfy(m -> assertThat(m.get("sede").get("id").asLong()).isEqualTo(mare));
        assertThat(leggi("/api/movimenti?sedi=1").get("elementi")).isEmpty();

        // le occorrenze future seguono la sede del modello: cambiandola con QUESTO_E_PROSSIMI cambiano anche quelle
        long idUltima = elenco.get(0).get("id").asLong();
        ObjectNode corpo = inSede(movimento("2026-03-05", "COSTO_FISSO", "NESSUNO", 50000), 1);
        modifica(idUltima, "QUESTO_E_PROSSIMI", corpo);
        orologio.imposta("2026-04-10");
        ricorrenze.generaOccorrenzeMancanti(java.time.LocalDate.of(2026, 4, 10));
        JsonNode aprile = leggi("/api/movimenti?da=2026-04-01&a=2026-04-30").get("elementi");
        assertThat(aprile).hasSize(1);
        assertThat(aprile.get(0).get("sede").get("id").asLong()).isEqualTo(1);
    }

    @org.springframework.beans.factory.annotation.Autowired
    private it.contabilita.ricorrenze.RicorrenzeService ricorrenze;

    // ---------------------------------------------------------------- dividi

    @Test
    void dividiUnImportoNonDivisibileDaiCentesimiDiRestoAllePrimeSedi() throws Exception {
        long mare = creaSede("Sede Mare");
        long monti = creaSede("Sede Monti");
        ObjectNode corpo = movimento("2026-03-10", "COSTO_VARIABILE", "FATTURA", 1000);
        corpo.put("fornitore", "Forno Prova");
        corpo.put("numeroDocumento", "F/1");
        corpo.put("categoria", "Farine");
        JsonNode creati = invia(post("/api/movimenti/dividi"), corpo, 201);
        assertThat(creati).hasSize(3);
        assertThat(creati.get(0).get("importoCent").asLong()).isEqualTo(334);
        assertThat(creati.get(1).get("importoCent").asLong()).isEqualTo(333);
        assertThat(creati.get(2).get("importoCent").asLong()).isEqualTo(333);
        assertThat(creati.get(0).get("sede").get("id").asLong()).isEqualTo(1);
        assertThat(creati.get(1).get("sede").get("id").asLong()).isEqualTo(mare);
        assertThat(creati.get(2).get("sede").get("id").asLong()).isEqualTo(monti);
        assertThat(creati).allSatisfy(m -> {
            assertThat(m.get("origine").asText()).isEqualTo("MANO");
            assertThat(m.get("fornitore").get("nome").asText()).isEqualTo("Forno Prova");
            assertThat(m.get("numeroDocumento").asText()).isEqualTo("F/1");
            assertThat(m.get("categoria").get("nome").asText()).isEqualTo("Farine");
            assertThat(m.get("data").asText()).isEqualTo("2026-03-10");
        });
        JsonNode elenco = leggi("/api/movimenti");
        assertThat(elenco.get("elementi")).hasSize(3);
        assertThat(elenco.get("totali").get("costiCent").asLong()).isEqualTo(1000);
    }

    @Test
    void dividiDueCentesimiSuTreSediSaltaLaSedeSenzaParteEUnaSedeArchiviataNonPartecipa() throws Exception {
        creaSede("Sede Mare");
        long monti = creaSede("Sede Monti");
        JsonNode due = invia(post("/api/movimenti/dividi"), movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 2), 201);
        assertThat(due).hasSize(2); // 1 + 1, la terza sede resterebbe a zero
        assertThat(due.get(0).get("importoCent").asLong() + due.get(1).get("importoCent").asLong()).isEqualTo(2);

        invia(put("/api/sedi/" + monti), json.createObjectNode().put("archiviata", true), 200);
        JsonNode sette = invia(post("/api/movimenti/dividi"), movimento("2026-03-11", "RICAVO", "RICAVO_EXTRA", 7), 201);
        assertThat(sette).hasSize(2);
        assertThat(sette.get(0).get("importoCent").asLong()).isEqualTo(4);
        assertThat(sette.get(1).get("importoCent").asLong()).isEqualTo(3);
        assertThat(leggi("/api/movimenti?sedi=" + monti).get("elementi")).isEmpty();
    }

    @Test
    void dividiSoloFraLeSediScelteConIlRestoAllePrime() throws Exception {
        long mare = creaSede("Sede Mare");
        long monti = creaSede("Sede Monti");
        JsonNode creati = invia(post("/api/movimenti/dividi?sedi=" + monti + ",1"), movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 1001), 201);
        assertThat(creati).hasSize(2);
        assertThat(creati.get(0).get("sede").get("id").asLong()).isEqualTo(1);
        assertThat(creati.get(0).get("importoCent").asLong()).isEqualTo(501);
        assertThat(creati.get(1).get("sede").get("id").asLong()).isEqualTo(monti);
        assertThat(creati.get(1).get("importoCent").asLong()).isEqualTo(500);
        assertThat(leggi("/api/movimenti?sedi=" + mare).get("elementi")).isEmpty();
    }

    @Test
    void dividiFraSediScelteRifiutaMenoDiDueSediArchiviateEInesistentiSenzaCrearNiente() throws Exception {
        long mare = creaSede("Sede Mare");
        long monti = creaSede("Sede Monti");
        invia(put("/api/sedi/" + monti), json.createObjectNode().put("archiviata", true), 200);
        ObjectNode corpo = movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 1000);
        errore(post("/api/movimenti/dividi?sedi=" + mare), corpo, 400);
        errore(post("/api/movimenti/dividi?sedi=1," + monti), corpo, 400);
        errore(post("/api/movimenti/dividi?sedi=1,999"), corpo, 400);
        errore(post("/api/movimenti/dividi?sedi=1,abc"), corpo, 400);
        assertThat(leggi("/api/movimenti").get("elementi")).isEmpty();
    }

    @Test
    void dividereUnCostoFissoRipetutoDaOgniSedeLaSuaRipetizioneConLaSuaParte() throws Exception {
        long mare = creaSede("Sede Mare");
        ObjectNode affitto = movimento("2026-03-10", "COSTO_FISSO", "NESSUNO", 100001);
        affitto.put("categoria", "Affitto");
        affitto.putObject("ricorrenza").put("giorno", 10);
        JsonNode creati = invia(post("/api/movimenti/dividi?sedi=1," + mare), affitto, 201);
        assertThat(creati).hasSize(2);
        assertThat(creati.get(0).get("importoCent").asLong()).isEqualTo(50001);
        assertThat(creati.get(1).get("importoCent").asLong()).isEqualTo(50000);
        assertThat(creati.get(0).get("ricorrenza").get("id").asLong()).isNotEqualTo(creati.get(1).get("ricorrenza").get("id").asLong());
        // il mese dopo (se gia' dovuto) esce con la parte di ciascuna sede: ogni sede ha piu' di un movimento da 500,0x
        JsonNode inMare = leggi("/api/movimenti?sedi=" + mare).get("elementi");
        assertThat(inMare).isNotEmpty();
        assertThat(inMare).allSatisfy(m -> assertThat(m.get("importoCent").asLong()).isEqualTo(50000));
    }

    @Test
    void conUnaSolaSedeAttivaDividiCreaUnSoloMovimentoConTuttoLImporto() throws Exception {
        JsonNode creati = invia(post("/api/movimenti/dividi"), movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 1001), 201);
        assertThat(creati).hasSize(1);
        assertThat(creati.get(0).get("importoCent").asLong()).isEqualTo(1001);
        assertThat(creati.get(0).get("sede").get("id").asLong()).isEqualTo(1);
    }

    @Test
    void dividiRifiutaRicorrenzaSedeEdatiNonValidiSenzaCrearNiente() throws Exception {
        creaSede("Sede Mare");
        errore(post("/api/movimenti/dividi"), inSede(movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 1000), 1), 400);
        errore(post("/api/movimenti/dividi"), movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 0), 400);
        errore(post("/api/movimenti/dividi"), movimento("2026-03-10", "RICAVO", "FATTURA", 1000), 400);
        assertThat(leggi("/api/movimenti").get("elementi")).isEmpty();
    }

    // ---------------------------------------------------------------- riepilogo

    @Test
    void ilRiepilogoHaPerSedeELoSiFiltraPerSedi() throws Exception {
        long mare = creaSede("Sede Mare");
        long monti = creaSede("Sede Monti"); // senza movimenti nel periodo: compare a zero
        crea(inSede(movimento("2026-03-01", "RICAVO", "RICAVO_FATTURATO", 100000), 1));
        crea(inSede(movimento("2026-03-02", "COSTO_VARIABILE", "FATTURA", 30000), 1));
        crea(inSede(movimento("2026-03-03", "COSTO_VARIABILE", "NOTA_DI_CREDITO", 1000), 1));
        crea(inSede(movimento("2026-03-04", "RICAVO", "RICAVO_EXTRA", 50000), mare));
        crea(inSede(movimento("2026-03-05", "COSTO_FISSO", "RETRIBUZIONE_REGOLARE", 80000), mare));
        crea(inSede(movimento("2026-04-01", "RICAVO", "RICAVO_EXTRA", 99999), monti)); // fuori periodo

        JsonNode r = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31");
        // i campi di sempre non cambiano: ricavi 150000, costi 29000 + 80000
        assertThat(r.get("ricavi").get("totaleCent").asLong()).isEqualTo(150000);
        assertThat(r.get("costiCent").asLong()).isEqualTo(109000);
        assertThat(r.get("risultatoCent").asLong()).isEqualTo(41000);
        JsonNode per = r.get("perSede");
        assertThat(per).hasSize(3);
        assertThat(per.get(0).get("sede").get("id").asLong()).isEqualTo(1);
        assertThat(per.get(0).get("sede").get("nome").asText()).isEqualTo("Sede principale");
        assertThat(per.get(0).get("ricaviCent").asLong()).isEqualTo(100000);
        assertThat(per.get(0).get("costiCent").asLong()).isEqualTo(29000); // la nota di credito riduce
        assertThat(per.get(0).get("risultatoCent").asLong()).isEqualTo(71000);
        assertThat(per.get(1).get("sede").get("id").asLong()).isEqualTo(mare);
        assertThat(per.get(1).get("ricaviCent").asLong()).isEqualTo(50000);
        assertThat(per.get(1).get("costiCent").asLong()).isEqualTo(80000);
        assertThat(per.get(1).get("risultatoCent").asLong()).isEqualTo(-30000);
        assertThat(per.get(2).get("sede").get("id").asLong()).isEqualTo(monti);
        assertThat(per.get(2).get("ricaviCent").asLong()).isZero();
        assertThat(per.get(2).get("costiCent").asLong()).isZero();
        assertThat(per.get(2).get("risultatoCent").asLong()).isZero();

        // filtro: solo Mare; i totali e perSede seguono
        JsonNode soloMare = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31&sedi=" + mare);
        assertThat(soloMare.get("ricavi").get("totaleCent").asLong()).isEqualTo(50000);
        assertThat(soloMare.get("costiCent").asLong()).isEqualTo(80000);
        assertThat(soloMare.get("risultatoCent").asLong()).isEqualTo(-30000);
        assertThat(soloMare.get("perSede")).hasSize(1);
        assertThat(soloMare.get("perSede").get(0).get("sede").get("nome").asText()).isEqualTo("Sede Mare");

        // due sedi, la somma di perSede e' il totale
        JsonNode due = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31&sedi=1," + mare);
        assertThat(due.get("perSede")).hasSize(2);
        assertThat(due.get("risultatoCent").asLong()).isEqualTo(41000);

        errore(get("/api/riepilogo?da=2026-03-01&a=2026-03-31&sedi=x"), null, 400);
    }

    @Test
    void unaSedeArchiviataSenzaMovimentiNelPeriodoNonCompareInPerSede() throws Exception {
        long mare = creaSede("Sede Mare");
        crea(inSede(movimento("2026-03-04", "RICAVO", "RICAVO_EXTRA", 5000), mare));
        invia(put("/api/sedi/" + mare), json.createObjectNode().put("archiviata", true), 200);
        // nel periodo ha movimenti: compare; in un altro periodo no
        assertThat(leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31").get("perSede")).hasSize(2);
        JsonNode altro = leggi("/api/riepilogo?da=2026-05-01&a=2026-05-31").get("perSede");
        assertThat(altro).hasSize(1);
        assertThat(altro.get(0).get("sede").get("id").asLong()).isEqualTo(1);
    }
}
