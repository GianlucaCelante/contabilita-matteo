package it.contabilita.esporta;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.contabilita.ProvaBase;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MvcResult;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * GET /api/esporta (docs/api.md, "Esportazione (fase 3)"). Il set di marzo 2026 e' quello di
 * RiepilogoApiTest piu' un fornitore con caratteri da escapare; fuori periodo il 28 febbraio e il
 * 1 aprile.
 */
class EsportaApiTest extends ProvaBase {

    private static final String INTESTAZIONE_CSV =
            "Data;Tipo;Documento;Categoria;Fornitore;Dipendente;Descrizione;N. documento;Note;Importo;Origine";

    private void inserisciSet() throws Exception {
        crea(movimento("2026-03-31", "RICAVO", "RICAVO_EXTRA", 25050));
        crea(movimento("2026-03-01", "RICAVO", "RICAVO_FATTURATO", 100000));
        ObjectNode fattura = movimento("2026-03-10", "COSTO_VARIABILE", "FATTURA", 30000);
        fattura.put("fornitore", "Caffè \"Rossi\"; Figli");
        fattura.put("descrizione", "Riga uno\nriga due");
        fattura.put("numeroDocumento", "F/12");
        fattura.put("categoria", "Materie prime");
        fattura.put("note", "Pagato 50 € in contanti");
        crea(fattura);
        crea(movimento("2026-03-10", "COSTO_VARIABILE", "SCONTRINO", 4550));
        ObjectNode retribuzione = movimento("2026-03-27", "COSTO_FISSO", "RETRIBUZIONE_REGOLARE", 80000);
        retribuzione.put("dipendente", "Giuseppe Verdi");
        crea(retribuzione);
        crea(movimento("2026-03-27", "COSTO_FISSO", "RETRIBUZIONE_EXTRA", 20000));
        ObjectNode affitto = movimento("2026-03-05", "COSTO_FISSO", "NESSUNO", 60000);
        affitto.put("categoria", "Affitto");
        crea(affitto);
        crea(movimento("2026-02-28", "COSTO_VARIABILE", "FATTURA", 99999));
        crea(movimento("2026-04-01", "RICAVO", "RICAVO_FATTURATO", 99999));
    }

    /** Esegue la richiesta (con il redispatch asincrono dello streaming, se serve) e torna la risposta. */
    private MockHttpServletResponse scarica(String url) throws Exception {
        MvcResult r = mockMvc.perform(get(url)).andReturn();
        if (r.getRequest().isAsyncStarted()) {
            r = mockMvc.perform(asyncDispatch(r)).andReturn();
        }
        return r.getResponse();
    }

    private String csv(String url) throws Exception {
        MockHttpServletResponse risposta = scarica(url);
        assertThat(risposta.getStatus()).isEqualTo(200);
        return risposta.getContentAsString(StandardCharsets.UTF_8);
    }

    // ---------------------------------------------------------------- CSV

    @Test
    void csvHaBomSeparatorePuntoEVirgolaEVirgolaDecimale() throws Exception {
        inserisciSet();
        MockHttpServletResponse risposta = scarica("/api/esporta?formato=csv&da=2026-03-01&a=2026-03-31");
        assertThat(risposta.getStatus()).isEqualTo(200);
        byte[] byteRisposta = risposta.getContentAsByteArray();
        assertThat(byteRisposta[0]).isEqualTo((byte) 0xEF);
        assertThat(byteRisposta[1]).isEqualTo((byte) 0xBB);
        assertThat(byteRisposta[2]).isEqualTo((byte) 0xBF);
        assertThat(risposta.getContentType()).startsWith("text/csv");

        String testo = new String(byteRisposta, 3, byteRisposta.length - 3, StandardCharsets.UTF_8);
        // la riga della fattura contiene un a capo tra virgolette: si separano le righe a mano
        String[] righe = testo.split("\r\n");
        assertThat(righe[0]).isEqualTo(INTESTAZIONE_CSV);
        // ordinati per data crescente, poi per id
        assertThat(righe[1]).isEqualTo("2026-03-01;Ricavo;Fatturato;;;;;;;1000,00;A mano");
        assertThat(righe[2]).isEqualTo("2026-03-05;Costo fisso;-;Affitto;;;;;;-600,00;A mano");
        assertThat(righe[3]).startsWith("2026-03-10;Costo variabile;Fattura;");
        assertThat(righe[4]).isEqualTo("2026-03-10;Costo variabile;Scontrino;;;;;;;-45,50;A mano");
        assertThat(righe[5]).isEqualTo("2026-03-27;Costo fisso;Retribuzione regolare;;;Giuseppe Verdi;;;;-800,00;A mano");
        assertThat(righe[6]).isEqualTo("2026-03-27;Costo fisso;Retribuzione extra;;;;;;;-200,00;A mano");
        assertThat(righe[7]).isEqualTo("2026-03-31;Ricavo;Extra;;;;;;;250,50;A mano");
        assertThat(righe).hasSize(8);
    }

    // Nell'esportazione i costi sono negativi e una nota di credito, che li riduce, e' positiva.
    @Test
    void laNotaDiCreditoNelCsvHaSegnoPositivoEIlNomeDelDocumento() throws Exception {
        crea(movimento("2026-03-12", "COSTO_VARIABILE", "NOTA_DI_CREDITO", 5000));
        crea(movimento("2026-03-10", "COSTO_VARIABILE", "FATTURA", 30000));
        String testo = csv("/api/esporta?formato=csv&da=2026-03-01&a=2026-03-31");
        assertThat(testo).contains("Nota di credito").contains("50,00");
        assertThat(testo).doesNotContain("-50,00");
        assertThat(testo).contains("-300,00");
    }

    @Test
    void csvProteggeSeparatoreVirgoletteEACapoEMantieneAccentiEEuro() throws Exception {
        inserisciSet();
        String testo = csv("/api/esporta?formato=csv&da=2026-03-01&a=2026-03-31");
        assertThat(testo).contains(
                "2026-03-10;Costo variabile;Fattura;Materie prime;\"Caffè \"\"Rossi\"\"; Figli\";;\"Riga uno\nriga due\";F/12;Pagato 50 € in contanti;-300,00;A mano\r\n");
    }

    @Test
    void csvFiltraPerTipo() throws Exception {
        inserisciSet();
        String soloRicavi = csv("/api/esporta?formato=csv&da=2026-03-01&a=2026-03-31&includi=RICAVO");
        assertThat(soloRicavi.split("\r\n")).hasSize(3);
        assertThat(soloRicavi).doesNotContain("Costo");
        String ricaviEFissi = csv("/api/esporta?formato=csv&da=2026-03-01&a=2026-03-31&includi=RICAVO,COSTO_FISSO");
        assertThat(ricaviEFissi.split("\r\n")).hasSize(6);
        assertThat(ricaviEFissi).doesNotContain("Costo variabile");
    }

    @Test
    void csvPeriodoVuotoHaSoloLIntestazione() throws Exception {
        inserisciSet();
        String testo = csv("/api/esporta?formato=csv&da=2025-01-01&a=2025-01-31");
        assertThat(testo).isEqualTo("﻿" + INTESTAZIONE_CSV + "\r\n");
    }

    @Test
    void ilNomeDelFileRiportaIlPeriodo() throws Exception {
        MockHttpServletResponse csv = scarica("/api/esporta?formato=csv&da=2026-03-01&a=2026-03-31");
        assertThat(csv.getHeader("Content-Disposition"))
                .isEqualTo("attachment; filename=\"contabilita-2026-03-01_2026-03-31.csv\"");
        MockHttpServletResponse xlsx = scarica("/api/esporta?formato=xlsx&da=2026-01-01&a=2026-12-31");
        assertThat(xlsx.getHeader("Content-Disposition"))
                .isEqualTo("attachment; filename=\"contabilita-2026-01-01_2026-12-31.xlsx\"");
        assertThat(xlsx.getContentType()).isEqualTo("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }

    @Test
    void parametriNonValidiDanno400() throws Exception {
        String ok = "&da=2026-03-01&a=2026-03-31";
        errore(get("/api/esporta?formato=pdf" + ok), null, 400);
        errore(get("/api/esporta?da=2026-03-01&a=2026-03-31"), null, 400);
        errore(get("/api/esporta?formato=csv&a=2026-03-31"), null, 400);
        errore(get("/api/esporta?formato=csv&da=2026-03-01"), null, 400);
        errore(get("/api/esporta?formato=csv&da=2026-04-01&a=2026-03-01"), null, 400);
        errore(get("/api/esporta?formato=csv&da=marzo&a=2026-03-31"), null, 400);
        errore(get("/api/esporta?formato=csv" + ok + "&includi=RICAVO,BOH"), null, 400);
    }

    // ---------------------------------------------------------------- XLSX

    /** Una cella letta dal foglio: tipo ("n" numero, "inlineStr"/"s"/"str" testo), valore, indice di stile. */
    private record Cella(String tipo, String valore, String stile) {
        boolean numerica() { return tipo.equals("n"); }
    }

    /** Legge lo zip dalla directory centrale (un XLSX in streaming usa i data descriptor). */
    private Map<String, byte[]> apriZip(byte[] xlsx) throws Exception {
        Map<String, byte[]> voci = new LinkedHashMap<>();
        java.nio.file.Path file = java.nio.file.Files.createTempFile(CARTELLA_DATI, "esporta-", ".xlsx");
        try {
            java.nio.file.Files.write(file, xlsx);
            try (java.util.zip.ZipFile zip = new java.util.zip.ZipFile(file.toFile())) {
                for (ZipEntry e : java.util.Collections.list(zip.entries())) {
                    try (var in = zip.getInputStream(e)) {
                        voci.put(e.getName(), in.readAllBytes());
                    }
                }
            }
        } finally {
            java.nio.file.Files.deleteIfExists(file);
        }
        return voci;
    }

    private Document xml(byte[] contenuto) throws Exception {
        return DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(new ByteArrayInputStream(contenuto));
    }

    private List<String> nomiFogli(Map<String, byte[]> zip) throws Exception {
        NodeList fogli = xml(zip.get("xl/workbook.xml")).getElementsByTagName("sheet");
        List<String> nomi = new ArrayList<>();
        for (int i = 0; i < fogli.getLength(); i++) {
            nomi.add(((Element) fogli.item(i)).getAttribute("name"));
        }
        return nomi;
    }

    /** Il foglio numero {@code n} (1 = primo) come mappa riferimento -> cella (es. "A1"). */
    private Map<String, Cella> foglio(Map<String, byte[]> zip, int n) throws Exception {
        NodeList celle = xml(zip.get("xl/worksheets/sheet" + n + ".xml")).getElementsByTagName("c");
        Map<String, Cella> out = new LinkedHashMap<>();
        for (int i = 0; i < celle.getLength(); i++) {
            Element c = (Element) celle.item(i);
            String tipo = c.hasAttribute("t") ? c.getAttribute("t") : "n";
            NodeList testi = c.getElementsByTagName(tipo.equals("inlineStr") ? "t" : "v");
            if (testi.getLength() == 0) {
                continue;
            }
            out.put(c.getAttribute("r"), new Cella(tipo, testi.item(0).getTextContent(), c.getAttribute("s")));
        }
        return out;
    }

    private byte[] xlsx(String url) throws Exception {
        MockHttpServletResponse risposta = scarica(url);
        assertThat(risposta.getStatus()).isEqualTo(200);
        return risposta.getContentAsByteArray();
    }

    @Test
    void xlsxHaIDueFogliConDateEImportiNumerici() throws Exception {
        inserisciSet();
        Map<String, byte[]> zip = apriZip(xlsx("/api/esporta?formato=xlsx&da=2026-03-01&a=2026-03-31"));
        assertThat(nomiFogli(zip)).containsExactly("Movimenti", "Riepilogo");

        Map<String, Cella> m = foglio(zip, 1);
        String[] intestazioni = INTESTAZIONE_CSV.split(";");
        for (int c = 0; c < intestazioni.length; c++) {
            assertThat(m.get(((char) ('A' + c)) + "1").valore()).isEqualTo(intestazioni[c]);
        }
        // riga 2: ricavo fatturato del 1 marzo
        long serie = ChronoUnit.DAYS.between(LocalDate.of(1899, 12, 30), LocalDate.of(2026, 3, 1));
        assertThat(m.get("A2").numerica()).isTrue();
        assertThat(Double.parseDouble(m.get("A2").valore())).isEqualTo((double) serie);
        assertThat(m.get("B2").valore()).isEqualTo("Ricavo");
        assertThat(m.get("C2").valore()).isEqualTo("Fatturato");
        assertThat(m.get("J2").numerica()).isTrue();
        assertThat(Double.parseDouble(m.get("J2").valore())).isEqualTo(1000.0);
        assertThat(m.get("K2").valore()).isEqualTo("A mano");
        // riga 3: affitto, costo con segno negativo
        assertThat(Double.parseDouble(m.get("J3").valore())).isEqualTo(-600.0);
        // riga 4: la fattura con accenti, virgolette ed euro (nessun escaping nel foglio)
        assertThat(m.get("E4").valore()).isEqualTo("Caffè \"Rossi\"; Figli");
        assertThat(m.get("I4").valore()).isEqualTo("Pagato 50 € in contanti");
        assertThat(m.get("G4").valore()).isEqualTo("Riga uno\nriga due");
        // 7 movimenti + intestazione
        assertThat(m).doesNotContainKey("A9");
        assertThat(m).containsKey("A8");
        // data e importo hanno uno stile (formato) diverso da quello predefinito
        assertThat(m.get("A2").stile()).isNotEmpty().isNotEqualTo("0");
        assertThat(m.get("J2").stile()).isNotEmpty().isNotEqualTo("0");
        NodeList formati = xml(zip.get("xl/styles.xml")).getElementsByTagName("numFmt");
        List<String> codici = new ArrayList<>();
        for (int i = 0; i < formati.getLength(); i++) {
            codici.add(((Element) formati.item(i)).getAttribute("formatCode"));
        }
        assertThat(codici).anyMatch(c -> c.contains("€"));
        assertThat(codici).anyMatch(c -> c.contains("yyyy-mm-dd"));
    }

    @Test
    void xlsxFiltraPerTipo() throws Exception {
        inserisciSet();
        Map<String, byte[]> zip = apriZip(xlsx("/api/esporta?formato=xlsx&da=2026-03-01&a=2026-03-31&includi=COSTO_VARIABILE"));
        Map<String, Cella> m = foglio(zip, 1);
        assertThat(m.get("B2").valore()).isEqualTo("Costo variabile");
        assertThat(m.get("B3").valore()).isEqualTo("Costo variabile");
        assertThat(m).doesNotContainKey("B4");
    }

    @Test
    void ilFoglioRiepilogoCoincideConApiRiepilogo() throws Exception {
        inserisciSet();
        JsonNode r = leggi("/api/riepilogo?da=2026-03-01&a=2026-03-31");
        Map<String, byte[]> zip = apriZip(xlsx("/api/esporta?formato=xlsx&da=2026-03-01&a=2026-03-31"));
        Map<String, Cella> f = foglio(zip, 2);

        Map<String, Double> perVoce = new LinkedHashMap<>();
        for (int riga = 1; riga < 60; riga++) {
            Cella voce = f.get("A" + riga);
            Cella importo = f.get("B" + riga);
            if (voce != null && importo != null && importo.numerica()) {
                perVoce.put(voce.valore(), Double.parseDouble(importo.valore()));
            }
        }
        assertThat(perVoce.get("Ricavi fatturati")).isEqualTo(r.get("ricavi").get("fatturatiCent").asLong() / 100.0);
        assertThat(perVoce.get("Ricavi extra")).isEqualTo(r.get("ricavi").get("extraCent").asLong() / 100.0);
        assertThat(perVoce.get("Totale ricavi")).isEqualTo(r.get("ricavi").get("totaleCent").asLong() / 100.0);
        assertThat(perVoce.get("Fatture")).isEqualTo(r.get("costiVariabili").get("fattureCent").asLong() / 100.0);
        assertThat(perVoce.get("Scontrini")).isEqualTo(r.get("costiVariabili").get("scontriniCent").asLong() / 100.0);
        assertThat(perVoce.get("Totale costi variabili")).isEqualTo(r.get("costiVariabili").get("totaleCent").asLong() / 100.0);
        assertThat(perVoce.get("Retribuzione regolare")).isEqualTo(r.get("costiFissi").get("retribuzioneRegolareCent").asLong() / 100.0);
        assertThat(perVoce.get("Retribuzione extra")).isEqualTo(r.get("costiFissi").get("retribuzioneExtraCent").asLong() / 100.0);
        assertThat(perVoce.get("Affitto")).isEqualTo(600.0);
        assertThat(perVoce.get("Totale costi fissi")).isEqualTo(r.get("costiFissi").get("totaleCent").asLong() / 100.0);
        assertThat(perVoce.get("Costi")).isEqualTo(r.get("costiCent").asLong() / 100.0);
        assertThat(perVoce.get("Risultato")).isEqualTo(r.get("risultatoCent").asLong() / 100.0);
    }

    @Test
    void xlsxDiUnPeriodoVuotoHaComunqueIDueFogli() throws Exception {
        Map<String, byte[]> zip = apriZip(xlsx("/api/esporta?formato=xlsx&da=2025-01-01&a=2025-01-31"));
        assertThat(nomiFogli(zip)).containsExactly("Movimenti", "Riepilogo");
        Map<String, Cella> m = foglio(zip, 1);
        assertThat(m.get("A1").valore()).isEqualTo("Data");
        assertThat(m).doesNotContainKey("A2");
        assertThat(foglio(zip, 2).get("A1")).isNotNull();
    }
}
