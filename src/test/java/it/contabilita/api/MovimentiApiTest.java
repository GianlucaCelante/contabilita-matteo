package it.contabilita.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** Movimenti: CRUD, combinazioni non valide, creazione al volo, filtri e totali, anagrafiche. */
class MovimentiApiTest extends ProvaBase {

    @Test
    void creaLeggiModificaEliminaUnMovimento() throws Exception {
        ObjectNode in = movimento("2026-03-10", "COSTO_VARIABILE", "FATTURA", 12345);
        in.put("categoria", "Materie prime").put("fornitore", "Molino Rossi").put("descrizione", "Farina")
                .put("numeroDocumento", "FT-12").put("note", "urgente");
        JsonNode creato = crea(in);
        long id = creato.get("id").asLong();
        assertThat(creato.get("origine").asText()).isEqualTo("MANO");
        assertThat(creato.get("importoCent").asLong()).isEqualTo(12345);
        assertThat(creato.get("categoria").get("nome").asText()).isEqualTo("Materie prime");
        assertThat(creato.get("fornitore").get("nome").asText()).isEqualTo("Molino Rossi");
        assertThat(creato.get("dipendente").isNull()).isTrue();
        assertThat(creato.get("ricorrenza").isNull()).isTrue();
        assertThat(creato.get("allegatoNome").isNull()).isTrue();
        assertThat(creato.get("numeroDocumento").asText()).isEqualTo("FT-12");

        JsonNode letto = leggi("/api/movimenti/" + id);
        assertThat(letto).isEqualTo(creato);

        ObjectNode mod = movimento("2026-03-11", "COSTO_VARIABILE", "SCONTRINO", 999);
        mod.put("fornitore", "MOLINO ROSSI");
        JsonNode modificato = modifica(id, "SOLO_QUESTO", mod);
        assertThat(modificato.get("documento").asText()).isEqualTo("SCONTRINO");
        assertThat(modificato.get("data").asText()).isEqualTo("2026-03-11");
        assertThat(modificato.get("categoria").isNull()).isTrue();
        assertThat(modificato.get("fornitore").get("id")).isEqualTo(creato.get("fornitore").get("id"));

        elimina(id, "SOLO_QUESTO");
        errore(get("/api/movimenti/" + id), null, 404);
        errore(delete("/api/movimenti/" + id), null, 404);
        errore(put("/api/movimenti/" + id), mod, 404);
    }

    @Test
    void ilMovimentoDiceQuandoESstatoCreatoEModificato() throws Exception {
        JsonNode creato = crea(movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 500));
        long id = creato.get("id").asLong();
        assertThat(creato.get("creatoIl").asText()).isEqualTo("2026-01-01T10:00:00");
        assertThat(creato.get("modificatoIl").isNull()).isTrue(); // mai modificato

        orologio.avanza(3600);
        JsonNode modificato = modifica(id, "SOLO_QUESTO", movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 600));
        assertThat(modificato.get("creatoIl").asText()).isEqualTo("2026-01-01T10:00:00");
        assertThat(modificato.get("modificatoIl").asText()).isEqualTo("2026-01-01T11:00:00");
        assertThat(leggi("/api/movimenti/" + id)).isEqualTo(modificato);
    }

    @Test
    void combinazioniTipoDocumentoNonValideDanno400() throws Exception {
        String[][] ammesse = {
                {"RICAVO", "RICAVO_FATTURATO"}, {"RICAVO", "RICAVO_EXTRA"},
                {"COSTO_VARIABILE", "FATTURA"}, {"COSTO_VARIABILE", "SCONTRINO"},
                {"COSTO_FISSO", "RETRIBUZIONE_REGOLARE"}, {"COSTO_FISSO", "RETRIBUZIONE_EXTRA"}, {"COSTO_FISSO", "NESSUNO"}};
        for (String[] c : ammesse) {
            crea(movimento("2026-03-10", c[0], c[1], 100));
        }
        String[] tipi = {"RICAVO", "COSTO_VARIABILE", "COSTO_FISSO"};
        String[] documenti = {"RICAVO_FATTURATO", "RICAVO_EXTRA", "FATTURA", "SCONTRINO", "RETRIBUZIONE_REGOLARE", "RETRIBUZIONE_EXTRA", "NESSUNO"};
        int rifiutate = 0;
        for (String t : tipi) {
            for (String d : documenti) {
                boolean ok = java.util.Arrays.stream(ammesse).anyMatch(c -> c[0].equals(t) && c[1].equals(d));
                if (!ok) {
                    errore(post("/api/movimenti"), movimento("2026-03-10", t, d, 100), 400);
                    rifiutate++;
                }
            }
        }
        assertThat(rifiutate).isEqualTo(14);
        assertThat(leggi("/api/movimenti").get("elementi")).hasSize(7);
    }

    @Test
    void campiObbligatoriEValoriNonValidiDanno400() throws Exception {
        errore(post("/api/movimenti"), movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 0), 400);
        errore(post("/api/movimenti"), movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", -5), 400);
        ObjectNode senzaData = movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 5);
        senzaData.remove("data");
        errore(post("/api/movimenti"), senzaData, 400);
        ObjectNode senzaImporto = movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 5);
        senzaImporto.remove("importoCent");
        errore(post("/api/movimenti"), senzaImporto, 400);
        ObjectNode senzaTipo = movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 5);
        senzaTipo.remove("tipo");
        errore(post("/api/movimenti"), senzaTipo, 400);
        JsonNode e = errore(post("/api/movimenti"), movimento("2026-03-10", "REGALO", "RICAVO_EXTRA", 5), 400);
        assertThat(e.get("errore").asText()).contains("tipo");
        errore(post("/api/movimenti"), movimento("2026-13-45", "RICAVO", "RICAVO_EXTRA", 5), 400);
        errore(post("/api/movimenti"), "{rotto", 400);
        errore(put("/api/movimenti/1?ambito=SEMPRE"), movimento("2026-03-10", "RICAVO", "RICAVO_EXTRA", 5), 400);
        assertThat(leggi("/api/movimenti").get("elementi")).isEmpty();
    }

    @Test
    void creaAlVoloCategoriaFornitoreEDipendenteSenzaDuplicatiESenzaDistinguereMaiuscole() throws Exception {
        ObjectNode a = movimento("2026-03-10", "COSTO_FISSO", "RETRIBUZIONE_REGOLARE", 150000);
        a.put("categoria", "Stipendi").put("dipendente", "Mario Bianchi");
        JsonNode primo = crea(a);
        ObjectNode b = movimento("2026-04-10", "COSTO_FISSO", "RETRIBUZIONE_REGOLARE", 150000);
        b.put("categoria", "  STIPENDI ").put("dipendente", "mario  bianchi");
        JsonNode secondo = crea(b);
        assertThat(secondo.get("categoria").get("id")).isEqualTo(primo.get("categoria").get("id"));
        assertThat(secondo.get("dipendente").get("id")).isEqualTo(primo.get("dipendente").get("id"));
        assertThat(secondo.get("dipendente").get("nome").asText()).isEqualTo("Mario Bianchi");

        // la categoria prende il Tipo del movimento: stesso nome con un altro tipo e' un'altra categoria
        ObjectNode c = movimento("2026-04-11", "COSTO_VARIABILE", "FATTURA", 500);
        c.put("categoria", "Stipendi").put("fornitore", "  ");
        JsonNode terzo = crea(c);
        assertThat(terzo.get("categoria").get("id")).isNotEqualTo(primo.get("categoria").get("id"));
        assertThat(terzo.get("fornitore").isNull()).isTrue();

        JsonNode categorie = leggi("/api/categorie");
        assertThat(categorie).hasSize(2);
        assertThat(leggi("/api/categorie?tipo=COSTO_FISSO")).hasSize(1);
        assertThat(leggi("/api/categorie?tipo=COSTO_FISSO").get(0).get("tipo").asText()).isEqualTo("COSTO_FISSO");
        assertThat(leggi("/api/dipendenti")).hasSize(1);
        assertThat(leggi("/api/fornitori")).isEmpty();
    }

    @Test
    void anagraficheInPostRestituisconoIlEsistenteInsensibileAlleMaiuscole() throws Exception {
        ObjectNode corpo = json.createObjectNode().put("nome", "Caffè Moka").put("partitaIva", "01234567890");
        JsonNode nuovo = invia(post("/api/fornitori"), corpo, 201);
        assertThat(nuovo.get("partitaIva").asText()).isEqualTo("01234567890");
        JsonNode esistente = invia(post("/api/fornitori"), json.createObjectNode().put("nome", "CAFFÈ moka"), 200);
        assertThat(esistente.get("id")).isEqualTo(nuovo.get("id"));
        assertThat(esistente.get("nome").asText()).isEqualTo("Caffè Moka");

        invia(post("/api/dipendenti"), json.createObjectNode().put("nome", "Anna"), 201);
        invia(post("/api/dipendenti"), json.createObjectNode().put("nome", "anna"), 200);

        invia(post("/api/categorie"), json.createObjectNode().put("nome", "Affitto").put("tipo", "COSTO_FISSO"), 201);
        invia(post("/api/categorie"), json.createObjectNode().put("nome", "affitto").put("tipo", "COSTO_FISSO"), 200);
        invia(post("/api/categorie"), json.createObjectNode().put("nome", "Affitto").put("tipo", "COSTO_VARIABILE"), 201);
        errore(post("/api/categorie"), json.createObjectNode().put("nome", "Senza tipo"), 400);
        errore(post("/api/fornitori"), json.createObjectNode().put("nome", "   "), 400);

        assertThat(leggi("/api/fornitori?q=MOKA")).hasSize(1);
        assertThat(leggi("/api/fornitori?q=zzz")).isEmpty();
        assertThat(leggi("/api/dipendenti?q=AN")).hasSize(1);
    }

    @Test
    void elencoConFiltriTotaliEOrdinamento() throws Exception {
        crea(movimento("2026-03-01", "RICAVO", "RICAVO_FATTURATO", 100000));
        ObjectNode fa = movimento("2026-03-05", "COSTO_VARIABILE", "FATTURA", 30000);
        fa.put("fornitore", "Molino Rossi").put("descrizione", "Farina 00");
        crea(fa);
        ObjectNode sc = movimento("2026-03-05", "COSTO_VARIABILE", "SCONTRINO", 2000);
        sc.put("note", "Pomodori dal MOLINO?");
        crea(sc);
        ObjectNode re = movimento("2026-04-01", "COSTO_FISSO", "RETRIBUZIONE_REGOLARE", 50000);
        re.put("dipendente", "Anna");
        crea(re);

        JsonNode tutti = leggi("/api/movimenti");
        assertThat(tutti.get("elementi")).hasSize(4);
        assertThat(tutti.get("totali").get("ricaviCent").asLong()).isEqualTo(100000);
        assertThat(tutti.get("totali").get("costiCent").asLong()).isEqualTo(82000);
        assertThat(tutti.get("totali").get("saldoCent").asLong()).isEqualTo(18000);
        // data decrescente, poi id decrescente (i due del 5 marzo: lo scontrino e' stato inserito dopo)
        assertThat(tutti.get("elementi").get(0).get("data").asText()).isEqualTo("2026-04-01");
        assertThat(tutti.get("elementi").get(1).get("documento").asText()).isEqualTo("SCONTRINO");
        assertThat(tutti.get("elementi").get(2).get("documento").asText()).isEqualTo("FATTURA");
        assertThat(tutti.get("elementi").get(3).get("data").asText()).isEqualTo("2026-03-01");

        // da/a inclusivi
        JsonNode marzo5 = leggi("/api/movimenti?da=2026-03-05&a=2026-03-05");
        assertThat(marzo5.get("elementi")).hasSize(2);
        assertThat(marzo5.get("totali").get("costiCent").asLong()).isEqualTo(32000);
        assertThat(marzo5.get("totali").get("saldoCent").asLong()).isEqualTo(-32000);
        assertThat(leggi("/api/movimenti?da=2026-03-06").get("elementi")).hasSize(1);
        assertThat(leggi("/api/movimenti?a=2026-03-04").get("elementi")).hasSize(1);

        JsonNode soloCostiFissi = leggi("/api/movimenti?tipo=COSTO_FISSO");
        assertThat(soloCostiFissi.get("elementi")).hasSize(1);
        assertThat(soloCostiFissi.get("totali").get("ricaviCent").asLong()).isZero();

        // q: fornitore, descrizione, note, senza distinguere maiuscole
        assertThat(leggi("/api/movimenti?q=molino").get("elementi")).hasSize(2);
        assertThat(leggi("/api/movimenti?q=FARINA").get("elementi")).hasSize(1);
        assertThat(leggi("/api/movimenti?q=pomodori").get("elementi")).hasSize(1);
        assertThat(leggi("/api/movimenti?q=inesistente").get("elementi")).isEmpty();
        assertThat(leggi("/api/movimenti?q=inesistente").get("totali").get("saldoCent").asLong()).isZero();

        long idAnna = leggi("/api/dipendenti").get(0).get("id").asLong();
        JsonNode diAnna = leggi("/api/movimenti?dipendente=" + idAnna);
        assertThat(diAnna.get("elementi")).hasSize(1);
        assertThat(diAnna.get("elementi").get(0).get("dipendente").get("nome").asText()).isEqualTo("Anna");

        errore(get("/api/movimenti?da=2026-05-01&a=2026-04-01"), null, 400);
        errore(get("/api/movimenti?da=ieri"), null, 400);
        errore(get("/api/movimenti?tipo=BOH"), null, 400);
    }

    @Test
    void laModificaSoloQuestoNonToccaLaRicorrenzaEQuestoEProssimiSi() throws Exception {
        ObjectNode in = movimento("2026-01-10", "COSTO_FISSO", "NESSUNO", 50000);
        in.put("categoria", "Affitto").putObject("ricorrenza").put("giorno", 10);
        JsonNode m = crea(in);
        assertThat(m.get("ricorrenza").get("giorno").asInt()).isEqualTo(10);
        assertThat(m.get("ricorrenza").get("attiva").asBoolean()).isTrue();
        long id = m.get("id").asLong();
        long idRic = m.get("ricorrenza").get("id").asLong();
        assertThat(jdbc.queryForObject("SELECT importo_cent FROM ricorrenza WHERE id=?", Long.class, idRic)).isEqualTo(50000);

        ObjectNode solo = movimento("2026-01-10", "COSTO_FISSO", "NESSUNO", 51000);
        solo.put("categoria", "Affitto").putObject("ricorrenza").put("giorno", 20);
        modifica(id, "SOLO_QUESTO", solo);
        assertThat(jdbc.queryForObject("SELECT importo_cent FROM ricorrenza WHERE id=?", Long.class, idRic)).isEqualTo(50000);
        assertThat(jdbc.queryForObject("SELECT giorno FROM ricorrenza WHERE id=?", Integer.class, idRic)).isEqualTo(10);

        ObjectNode prossimi = movimento("2026-01-10", "COSTO_FISSO", "NESSUNO", 52000);
        prossimi.put("categoria", "Affitto").put("descrizione", "Nuovo contratto").putObject("ricorrenza").put("giorno", 20);
        JsonNode r = modifica(id, "QUESTO_E_PROSSIMI", prossimi);
        assertThat(r.get("ricorrenza").get("giorno").asInt()).isEqualTo(20);
        assertThat(jdbc.queryForObject("SELECT importo_cent FROM ricorrenza WHERE id=?", Long.class, idRic)).isEqualTo(52000);
        assertThat(jdbc.queryForObject("SELECT descrizione FROM ricorrenza WHERE id=?", String.class, idRic)).isEqualTo("Nuovo contratto");
        assertThat(jdbc.queryForObject("SELECT giorno FROM ricorrenza WHERE id=?", Integer.class, idRic)).isEqualTo(20);
    }

    @Test
    void laRetribuzioneExtraNonPuoEssereRicorrente() throws Exception {
        ObjectNode in = movimento("2026-01-10", "COSTO_FISSO", "RETRIBUZIONE_EXTRA", 50000);
        in.putObject("ricorrenza").put("giorno", 10);
        JsonNode e = errore(post("/api/movimenti"), in, 400);
        assertThat(e.get("errore").asText()).contains("extra");
        ObjectNode giornoZero = movimento("2026-01-10", "COSTO_FISSO", "NESSUNO", 50000);
        giornoZero.putObject("ricorrenza").put("giorno", 0);
        errore(post("/api/movimenti"), giornoZero, 400);
        ObjectNode giorno32 = movimento("2026-01-10", "COSTO_FISSO", "NESSUNO", 50000);
        giorno32.putObject("ricorrenza").put("giorno", 32);
        errore(post("/api/movimenti"), giorno32, 400);
        ObjectNode senzaGiorno = movimento("2026-01-10", "COSTO_FISSO", "NESSUNO", 50000);
        senzaGiorno.putObject("ricorrenza");
        errore(post("/api/movimenti"), senzaGiorno, 400);
        assertThat(leggi("/api/movimenti").get("elementi")).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ricorrenza", Integer.class)).isZero();
    }
}
