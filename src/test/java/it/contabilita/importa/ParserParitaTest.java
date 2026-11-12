package it.contabilita.importa;

import it.contabilita.importa.ParserFatturaPa.DatiFattura;
import it.contabilita.importa.ParserFatturaPa.ErroreLettura;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static it.contabilita.importa.FattureProva.body;
import static it.contabilita.importa.FattureProva.byt;
import static it.contabilita.importa.FattureProva.cedenteSemplificato;
import static it.contabilita.importa.FattureProva.denominazione;
import static it.contabilita.importa.FattureProva.fattura;
import static it.contabilita.importa.FattureProva.fatturaConPrefisso;
import static it.contabilita.importa.FattureProva.persona;
import static it.contabilita.importa.FattureProva.rigaSemplificata;
import static it.contabilita.importa.FattureProva.semplificata;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * s59: {@link ParserFatturaPa} non apre piu' tutto il file come DOM (legge a flusso e tiene solo gli elementi che guarda).
 * Qui si dimostra che il risultato e' lo stesso di prima: ogni file si legge con il percorso nuovo e con quello vecchio
 * ({@link ParserDomDiRiferimento}) e i due esiti devono coincidere in tutto, cioe' le fatture lette oppure il messaggio
 * per il cliente e il dettaglio per il log (numero di riga e testo dell'errore del lettore XML compresi).
 *
 * <p>I file: tutte le fatture dei test del pacchetto (quelle di {@link FattureProva} e gli XML scritti a mano in
 * {@link ParserFatturaPaTest}, {@link ParserSemplificataTest} e nei test dell'importazione; nel repository non ci sono
 * file XML di prova), piu' i casi che la lettura a flusso potrebbe trattare diversamente (allegati, elementi con lo stesso
 * nome in punti dove non si guardano, testo spezzato, codifiche, DOCTYPE), piu' migliaia di varianti generate da quelli:
 * il file troncato in ogni punto e un pezzo estraneo inserito dopo ogni tag.
 */
class ParserParitaTest {

    /** Le fatture oppure l'errore: quello che esce da una lettura. */
    private record Esito(List<DatiFattura> fatture, String messaggio, String dettaglio) {
    }

    private interface Lettura {
        List<DatiFattura> leggi(byte[] xml) throws ErroreLettura;
    }

    private static Esito esito(Lettura lettura, byte[] xml) {
        try {
            return new Esito(lettura.leggi(xml), null, null);
        } catch (ErroreLettura e) {
            return new Esito(null, e.getMessage(), e.dettaglio());
        }
    }

    /** Confronta i due percorsi su un file; torna l'esito (uguale). */
    private static Esito uguali(String nome, byte[] xml) {
        Esito nuovo = esito(ParserFatturaPa::leggi, xml);
        Esito vecchio = esito(ParserDomDiRiferimento::leggi, xml);
        assertThat(nuovo).as("%s:%n%s", nome, new String(xml, 0, Math.min(xml.length, 4000), StandardCharsets.ISO_8859_1)).isEqualTo(vecchio);
        return nuovo;
    }

    private static final String CEDENTE = denominazione("Forno Rossi Srl", "01234567890");
    private static final String CEDENTE_S = cedenteSemplificato("Ferramenta Bianchi Snc", "02468013579");
    private static final String BODY = body("TD01", "FT-12/A", "2026-10-03", "122.00", "100.00", "22.00");
    private static final String ALLEGATI = "<Allegati><NomeAttachment>fattura.pdf</NomeAttachment><FormatoAttachment>PDF</FormatoAttachment>"
            + "<Attachment>JVBERi0xLjQKJcfsj6IK</Attachment></Allegati>";
    private static final String DETTAGLIO = "<DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>Farina</Descrizione>"
            + "<Quantita>2.00</Quantita><PrezzoUnitario>50.00</PrezzoUnitario><PrezzoTotale>100.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>";

    /** Un corpo ordinario completo: dati generali, righe di dettaglio, riepilogo, pagamento e allegati. */
    private static String bodyCompleto(String tipo, String numero) {
        return body(tipo, numero, "2026-10-03", "122.00", "100.00", "22.00")
                .replace("<DatiBeniServizi>", "<DatiBeniServizi>" + DETTAGLIO + DETTAGLIO)
                .replace("</FatturaElettronicaBody>", "<DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento><DettaglioPagamento>"
                        + "<ModalitaPagamento>MP05</ModalitaPagamento><ImportoPagamento>122.00</ImportoPagamento></DettaglioPagamento></DatiPagamento>"
                        + ALLEGATI + ALLEGATI + "</FatturaElettronicaBody>");
    }

    /** I file di partenza, per nome. */
    private static Map<String, byte[]> corpus() throws Exception {
        Map<String, byte[]> c = new LinkedHashMap<>();
        String ok = denominazione("X", "1");

        // ---- ParserFatturaPaTest ----
        c.put("denominazione", byt(fattura(CEDENTE, BODY)));
        c.put("persona", byt(fattura(persona("Mario", "Bianchi", "09876543210"), body("TD01", "7", "2026-01-15", "50.00", "40.98", "9.02"))));
        for (String prefisso : new String[]{"p", "ns3", "ns2", "a"}) {
            c.put("prefisso " + prefisso, byt(fatturaConPrefisso(prefisso, denominazione("Cantina Verdi", "11111111111"),
                    body("TD01", "9", "2026-02-01", "10.00", "8.20", "1.80"))));
        }
        c.put("lotto", byt(fattura(denominazione("Grossista Neri", "22222222222"),
                body("TD01", "1", "2026-03-01", "122.00", "100.00", "22.00"), body("TD01", "2", "2026-03-02", "61.00", "50.00", "11.00"))));
        c.put("due riepiloghi senza totale", byt(fattura(ok, "<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento>"
                + "<TipoDocumento>TD01</TipoDocumento><Data>2026-04-04</Data><Numero>5</Numero></DatiGeneraliDocumento></DatiGenerali>"
                + "<DatiBeniServizi><DatiRiepilogo><ImponibileImporto>10.10</ImponibileImporto><Imposta>2.22</Imposta></DatiRiepilogo>"
                + "<DatiRiepilogo><ImponibileImporto>20.20</ImponibileImporto><Imposta>0.00</Imposta></DatiRiepilogo>"
                + "</DatiBeniServizi></FatturaElettronicaBody>")));
        c.put("senza riepilogo", byt(fattura(ok, "<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento>"
                + "<TipoDocumento>TD01</TipoDocumento><Data>2026-04-04</Data><Numero>5</Numero><ImportoTotaleDocumento>7.00</ImportoTotaleDocumento>"
                + "</DatiGeneraliDocumento></DatiGenerali></FatturaElettronicaBody>")));
        c.put("decimali", byt(fattura(ok, body("TD01", "1", "2026-04-04", "1234567.89", "0.10", "0.20"))));
        c.put("quattro decimali", byt(fattura(ok, body("TD01", "1", "2026-04-04", "0.30", "0.1500", "0.1500"))));
        for (String tipo : List.of("TD01", "TD02", "TD03", "TD04", "TD05", "TD06", "TD07", "TD08", "TD09", "TD16", "TD17", "TD18", "TD19",
                "TD20", "TD24", "TD25", "TD26", "TD28", "TD99", "")) {
            c.put("tipo " + tipo, byt(fattura(CEDENTE, body(tipo, "N-" + tipo, "2026-10-09", "10.00", "8.20", "1.80"))));
        }
        c.put("non xml", byt("questo non è xml"));
        c.put("non xml su due righe", byt("riga uno\nquesto non è xml"));
        c.put("altro documento", byt("<?xml version=\"1.0\"?><altro><a/></altro>"));
        c.put("senza body", byt(fattura(ok)));
        c.put("cedente vuoto", byt(fattura("<CedentePrestatore/>", body("TD01", "1", "2026-04-04", "10.00", "8.20", "1.80"))));
        c.put("anagrafica vuota", byt(fattura("<CedentePrestatore><DatiAnagrafici><Anagrafica/></DatiAnagrafici></CedentePrestatore>",
                body("TD01", "1", "2026-04-04", "10.00", "8.20", "1.80"))));
        c.put("senza intestazione", byt(fattura(ok, BODY).replaceAll("<FatturaElettronicaHeader>.*</FatturaElettronicaHeader>", "")));
        c.put("dati generali vuoti", byt(fattura(ok, "<FatturaElettronicaBody><DatiGenerali/></FatturaElettronicaBody>")));
        c.put("body vuoto", byt(fattura(ok, "<FatturaElettronicaBody/>")));
        c.put("senza numero", byt(fattura(ok, body("TD01", "", "2026-04-04", "10.00", "8.20", "1.80"))));
        c.put("data sbagliata", byt(fattura(ok, body("TD01", "1", "31/12/2026", "10.00", "8.20", "1.80"))));
        c.put("senza data", byt(fattura(ok, body("TD01", "1", "", "10.00", "8.20", "1.80"))));
        c.put("totale sbagliato", byt(fattura(ok, body("TD01", "1", "2026-04-04", "abc", "8.20", "1.80"))));
        c.put("imponibile sbagliato", byt(fattura(ok, body("TD01", "1", "2026-04-04", "10.00", "x", "1.80"))));
        c.put("imposta sbagliata", byt(fattura(ok, body("TD01", "1", "2026-04-04", "10.00", "8.20", "y"))));
        c.put("zero", byt(fattura(CEDENTE, body("TD01", "Z-1", "2026-10-09", "0.00", "0.00", "0.00"))));
        c.put("negativa", byt(fattura(CEDENTE, body("TD01", "N-1", "2026-10-09", "-5.00", "-4.10", "-0.90"))));
        String senzaDichiarazione = fattura(denominazione("&xxe;", "1"), body("TD01", "1", "2026-04-04", "10.00", "8.20", "1.80"))
                .replace("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n", "");
        c.put("xxe file locale", byt("<?xml version=\"1.0\"?>\n<!DOCTYPE FatturaElettronica [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]>\n" + senzaDichiarazione));
        c.put("entita senza doctype", byt("<?xml version=\"1.0\"?>\n" + senzaDichiarazione));
        c.put("dtd esterna", byt("<?xml version=\"1.0\"?>\n<!DOCTYPE FatturaElettronica SYSTEM \"http://127.0.0.1:1/x.dtd\">\n<FatturaElettronica/>"));
        c.put("billion laughs", byt("<?xml version=\"1.0\"?><!DOCTYPE lolz [<!ENTITY a \"aaaaaaaaaa\"><!ENTITY b \"&a;&a;&a;&a;&a;&a;&a;&a;\">]><lolz>&b;</lolz>"));
        c.put("doctype con entita", byt("<?xml version=\"1.0\"?><!DOCTYPE x [<!ENTITY a \"b\">]><x/>"));
        c.put("doctype dopo tre righe", byt("<?xml version=\"1.0\"?>\n\n\n<!DOCTYPE FatturaElettronica>\n" + senzaDichiarazione));
        c.put("xxe dei test dell'importazione", byt("<?xml version=\"1.0\"?><!DOCTYPE x [<!ENTITY e SYSTEM \"file:///etc/passwd\">]><x>&e;</x>"));

        // ---- ParserSemplificataTest ----
        c.put("semplificata", byt(semplificata("p", CEDENTE_S, "TD07", "S-12", "2026-10-06",
                rigaSemplificata("Viti e tasselli", "36.60", "6.60", null), rigaSemplificata("Colla", "10.00", "1.80", null))));
        c.put("semplificata aliquota", byt(semplificata("", CEDENTE_S, "TD07", "1", "2026-10-06",
                rigaSemplificata("Nastro", "12.20", null, "22.00"), rigaSemplificata("Pane", "10.00", null, "10.00"))));
        c.put("semplificata imposta e aliquota", byt(semplificata("", CEDENTE_S, "TD07", "1", "2026-10-06",
                rigaSemplificata("Nastro", "12.20", "2.19", "22.00"))));
        c.put("semplificata esente", byt(semplificata("", CEDENTE_S, "TD07", "1", "2026-10-06",
                "<DatiBeniServizi><Descrizione>Corso</Descrizione><Importo>50.00</Importo><Natura>N4</Natura></DatiBeniServizi>")));
        for (String imposta : List.of("-2.20", "12.21", "50.00", "0.00", "12.20")) {
            c.put("semplificata imposta " + imposta, byt(semplificata("", CEDENTE_S, "TD07", "1", "2026-10-06",
                    rigaSemplificata("Viti", "36.60", "6.60", null), rigaSemplificata("Nastro", "12.20", imposta, null))));
        }
        c.put("semplificata persona", byt(semplificata("ns2", "<CedentePrestatore><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01928374650</IdCodice>"
                + "</IdFiscaleIVA><Nome>Luca</Nome><Cognome>Verdi</Cognome><RegimeFiscale>RF19</RegimeFiscale></CedentePrestatore>",
                "TD07", "1", "2026-10-06", rigaSemplificata("Riparazione", "61.00", "11.00", null))));
        for (String tipo : List.of("TD08", "TD09")) {
            c.put("semplificata " + tipo, byt(semplificata("", CEDENTE_S, tipo, "1", "2026-10-06", rigaSemplificata("Reso", "12.20", "2.20", null))));
        }
        c.put("semplificata senza righe", byt(semplificata("", CEDENTE_S, "TD07", "1", "2026-10-06")));
        c.put("semplificata senza importo", byt(semplificata("", CEDENTE_S, "TD07", "1", "2026-10-06", rigaSemplificata("Viti", null, "2.20", null))));
        c.put("semplificata importo sbagliato", byt(semplificata("", CEDENTE_S, "TD07", "1", "2026-10-06", rigaSemplificata("Viti", "dodici", "2.20", null))));
        c.put("semplificata aliquota sbagliata", byt(semplificata("", CEDENTE_S, "TD07", "1", "2026-10-06", rigaSemplificata("Viti", "12.20", null, "ventidue"))));
        c.put("semplificata aliquota negativa", byt(semplificata("", CEDENTE_S, "TD07", "1", "2026-10-06", rigaSemplificata("Viti", "12.20", null, "-22.00"))));
        c.put("semplificata senza nome", byt(semplificata("", "<CedentePrestatore><RegimeFiscale>RF01</RegimeFiscale></CedentePrestatore>",
                "TD07", "1", "2026-10-06", rigaSemplificata("Viti", "12.20", "2.20", null))));
        c.put("semplificata con cedente ordinario", byt(semplificata("", CEDENTE, "TD07", "1", "2026-10-06", rigaSemplificata("Viti", "12.20", "2.20", null))));
        c.put("ordinaria con cedente semplificato", byt(fattura(CEDENTE_S, BODY)));
        c.put("ordinaria con righe semplificate", byt(fattura(CEDENTE, BODY.replace("</DatiBeniServizi>", "<Importo>5.00</Importo><DatiIVA><Imposta>1.00</Imposta></DatiIVA></DatiBeniServizi>"))));
        c.put("semplificata con riepilogo", byt(semplificata("", CEDENTE_S, "TD07", "1", "2026-10-06", rigaSemplificata("Viti", "12.20", "2.20", null)
                .replace("</DatiBeniServizi>", "<DatiRiepilogo><ImponibileImporto>9.00</ImponibileImporto><Imposta>1.00</Imposta></DatiRiepilogo></DatiBeniServizi>"))));

        // ---- quello che la lettura a flusso non tiene: allegati, righe di dettaglio, pagamenti ----
        c.put("completa", byt(fattura(CEDENTE, bodyCompleto("TD01", "C-1"))));
        c.put("lotto completo con prefisso", byt(fatturaConPrefisso("p", CEDENTE, bodyCompleto("TD01", "C-1"), bodyCompleto("TD04", "C-2"))));
        c.put("semplificata con allegati", byt(semplificata("p", CEDENTE_S, "TD07", "S-12", "2026-10-06",
                rigaSemplificata("Viti", "36.60", "6.60", null), ALLEGATI)));
        c.put("allegato grande", byt(fattura(CEDENTE, BODY.replace("</FatturaElettronicaBody>",
                "<Allegati><NomeAttachment>grande.pdf</NomeAttachment><Attachment>" + "QUJDREVGR0g=\n".repeat(30_000) + "</Attachment></Allegati></FatturaElettronicaBody>"))));
        c.put("allegato rovinato", byt(fattura(CEDENTE, BODY.replace("</FatturaElettronicaBody>",
                "<Allegati><Attachment>" + "QUJD".repeat(5_000) + "<</Attachment></Allegati></FatturaElettronicaBody>"))));
        c.put("allegato non chiuso", byt(fattura(CEDENTE, BODY.replace("</FatturaElettronicaBody>",
                "<Allegati><Attachment>" + "QUJD".repeat(5_000) + "</Allegati></FatturaElettronicaBody>"))));
        c.put("allegato con dentro una fattura", byt(fattura(CEDENTE, BODY.replace("</FatturaElettronicaBody>",
                "<Allegati>" + BODY + "<DatiGenerali><DatiGeneraliDocumento><Numero>FINTO</Numero></DatiGeneraliDocumento></DatiGenerali></Allegati></FatturaElettronicaBody>"))));
        c.put("mille righe di dettaglio", byt(fattura(CEDENTE, BODY.replace("<DatiBeniServizi>", "<DatiBeniServizi>" + DETTAGLIO.repeat(1_000)))));
        c.put("cento fatture in un lotto", byt(fattura(CEDENTE, lotto(100))));
        c.put("mille riepiloghi", byt(fattura(CEDENTE, BODY.replace("</DatiBeniServizi>",
                "<DatiRiepilogo><ImponibileImporto>0.01</ImponibileImporto><Imposta>0.01</Imposta></DatiRiepilogo>".repeat(1_000) + "</DatiBeniServizi>"))));
        c.put("mille date", byt(fattura(CEDENTE, BODY.replace("<Data>", "<Data/>".repeat(1_000) + "<Data>"))));
        c.put("mille righe semplificate", byt(semplificata("", CEDENTE_S, "TD07", "1", "2026-10-06", rigaSemplificata("Viti", "0.10", null, "22.00").repeat(1_000))));

        // ---- stessi nomi in punti dove non si guardano, doppioni, ordine ----
        c.put("due intestazioni", byt(fattura(CEDENTE, BODY).replace("<FatturaElettronicaBody>",
                "<FatturaElettronicaHeader>" + denominazione("Secondo", "2") + "</FatturaElettronicaHeader><FatturaElettronicaBody>")));
        c.put("prima intestazione vuota", byt(fattura(CEDENTE, BODY).replace("<FatturaElettronicaHeader>", "<FatturaElettronicaHeader/><FatturaElettronicaHeader>")));
        c.put("due cedenti", byt(fattura(denominazione("Primo", "1") + denominazione("Secondo", "2"), BODY)));
        c.put("due dati generali", byt(fattura(CEDENTE, BODY.replace("<DatiGenerali>", "<DatiGenerali/><DatiGenerali>"))));
        c.put("due documenti", byt(fattura(CEDENTE, BODY.replace("</DatiGenerali>",
                "<DatiGeneraliDocumento><Numero>SECONDO</Numero></DatiGeneraliDocumento></DatiGenerali>"))));
        c.put("due beni e servizi", byt(fattura(CEDENTE, BODY.replace("<DatiBeniServizi>",
                "<DatiBeniServizi><DatiRiepilogo><ImponibileImporto>1.00</ImponibileImporto><Imposta>0.22</Imposta></DatiRiepilogo></DatiBeniServizi><DatiBeniServizi>"))));
        c.put("due numeri", byt(fattura(CEDENTE, BODY.replace("<Numero>", "<Numero>PRIMO</Numero><Numero>"))));
        c.put("denominazione e persona", byt(fattura(CEDENTE.replace("</Anagrafica>", "<Nome>Mario</Nome><Cognome>Rossi</Cognome></Anagrafica>"), BODY)));
        c.put("solo cognome", byt(fattura(CEDENTE.replaceAll("<Denominazione>.*</Denominazione>", "<Cognome>Rossi</Cognome>"), BODY)));
        c.put("senza partita iva", byt(fattura(CEDENTE.replaceAll("<IdFiscaleIVA>.*</IdFiscaleIVA>", ""), BODY)));
        c.put("cedente fuori dall'intestazione", byt(fattura("", CEDENTE + BODY)));
        c.put("body dentro l'intestazione", byt(fattura(CEDENTE + BODY)));
        c.put("body dentro un body", byt(fattura(CEDENTE, "<FatturaElettronicaBody>" + BODY + "</FatturaElettronicaBody>")));
        c.put("riepilogo fuori dai beni", byt(fattura(CEDENTE, BODY.replace("<DatiBeniServizi>", "").replace("</DatiBeniServizi>", ""))));
        c.put("documento fuori dai dati generali", byt(fattura(CEDENTE, BODY.replace("<DatiGenerali>", "").replace("</DatiGenerali>", ""))));
        c.put("radice sbagliata con dentro una fattura", byt(fattura(CEDENTE, BODY).replace("FatturaElettronica ", "Lotto ").replace("</FatturaElettronica>", "</Lotto>")));
        c.put("solo la radice", byt("<FatturaElettronica/>"));
        c.put("solo la radice semplificata", byt("<p:FatturaElettronicaSemplificata xmlns:p=\"urn:x\"></p:FatturaElettronicaSemplificata>"));

        // ---- testo: elementi dentro il testo, CDATA, commenti, istruzioni, riferimenti, spazi ----
        c.put("elemento dentro il numero", byt(fattura(CEDENTE, BODY.replace("<Numero>FT-12/A", "<Numero>FT-<b>12</b><!-- c -->/A<?pi x?>"))));
        c.put("allegati dentro il numero", byt(fattura(CEDENTE, BODY.replace("<Numero>FT-12/A", "<Numero>FT-12/A" + ALLEGATI))));
        c.put("allegati dentro la denominazione", byt(fattura(CEDENTE.replace("</Denominazione>", ALLEGATI + "</Denominazione>"), BODY)));
        c.put("allegati dentro l'importo semplificato", byt(semplificata("", CEDENTE_S.replace("</Denominazione>", " <x>e figli</x></Denominazione>"), "TD07", "1",
                "2026-10-06", rigaSemplificata("Viti", "12.20", "2.20", null).replace("</Importo>", "<Allegati>0</Allegati></Importo>"))));
        c.put("cdata", byt(fattura(denominazione("<![CDATA[Rossi & Figli <Srl>]]>", "1"), BODY.replace("FT-12/A", "FT<![CDATA[-12]]>/A"))));
        c.put("riferimenti", byt(fattura(denominazione("Caff&#232; &amp; T&#xE8; &lt;Srl&gt; &quot;x&quot; &apos;y&apos;", "1"), BODY)));
        c.put("spazi e a capo", byt(fattura(denominazione("  Forno \n\t Rossi   Srl ", " 01234567890 "), body(" TD01 ", " 1 ", " 2026-10-03 ", " 122.00 ", "\n100.00\n", " 22.00 "))
                .replace("><", ">\n  <")));
        c.put("riferimento a carattere non ammesso", byt(fattura(denominazione("A&#1;B", "1"), BODY)));
        c.put("entita sconosciuta", byt(fattura(denominazione("A&nbsp;B", "1"), BODY)));
        c.put("carattere di controllo", byt(fattura(denominazione("A\u0001B", "1"), BODY)));
        c.put("nome lungo", byt(fattura(denominazione("N".repeat(100_000), "1"), BODY)));
        c.put("commenti e istruzioni ovunque", byt(fattura(CEDENTE, BODY).replace("><", "><!-- c --><?pi dati?><")));
        c.put("testo fra gli elementi", byt(fattura(CEDENTE, BODY).replace("><", ">testo<")));

        // ---- nomi, prefissi, attributi ----
        String piuPrefissi = fattura(CEDENTE, bodyCompleto("TD01", "C-1"), bodyCompleto("TD04", "C-2"))
                .replace("<FatturaElettronica ", "<a:FatturaElettronica xmlns:a=\"urn:a\" xmlns:b=\"urn:b\" xmlns:c=\"http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2\" ")
                .replace("</FatturaElettronica>", "</a:FatturaElettronica>");
        c.put("solo la radice con prefisso", byt(piuPrefissi));
        c.put("tutti con prefisso, tre prefissi e tre namespace", byt(prefissiARotazione(piuPrefissi, "a", "b", "c")));
        c.put("tutti con prefisso, uno ridichiarato dentro", byt(prefissiARotazione(piuPrefissi, "b", "b", "c")
                .replace("<b:FatturaElettronicaBody>", "<b:FatturaElettronicaBody xmlns:b=\"urn:altro\" xmlns:c=\"urn:c2\">")));
        c.put("prefisso e namespace predefinito mescolati", byt(prefissiARotazione(piuPrefissi, "a", "", "c", "")));
        c.put("semplificata tutta con prefisso", byt(prefissiARotazione(semplificata("p", CEDENTE_S, "TD07", "S-12", "2026-10-06",
                rigaSemplificata("Viti", "36.60", "6.60", null), rigaSemplificata("Pane", "10.00", null, "10.00"), ALLEGATI)
                .replace("xmlns:p=", "xmlns:q=\"urn:q\" xmlns:p="), "p", "q")));
        c.put("mille riepiloghi con prefisso", byt(fatturaConPrefisso("q", CEDENTE, BODY.replace("</DatiBeniServizi>", "<DatiRiepilogo/>".repeat(1_000) + "</DatiBeniServizi>"))));
        c.put("prefissi diversi per elemento", byt(fattura(CEDENTE, BODY).replace("<FatturaElettronica ", "<FatturaElettronica xmlns:q=\"urn:q\" ")
                .replace("<Numero>", "<q:Numero>").replace("</Numero>", "</q:Numero>").replace("<DatiGenerali>", "<q:DatiGenerali>").replace("</DatiGenerali>", "</q:DatiGenerali>")));
        c.put("prefisso non dichiarato", byt(fattura(CEDENTE, BODY).replace("<Numero>", "<q:Numero>").replace("</Numero>", "</q:Numero>")));
        c.put("prefisso non dichiarato negli allegati", byt(fattura(CEDENTE, BODY.replace("</FatturaElettronicaBody>", "<Allegati><q:x/></Allegati></FatturaElettronicaBody>"))));
        c.put("senza namespace", byt(fattura(CEDENTE, BODY).replaceAll(" xmlns=\"[^\"]*\"", "")));
        c.put("attributo doppio negli allegati", byt(fattura(CEDENTE, BODY.replace("</FatturaElettronicaBody>", "<Allegati a=\"1\" a=\"2\"/></FatturaElettronicaBody>"))));
        c.put("attributi ovunque", byt(fattura(CEDENTE, BODY).replace("<Numero>", "<Numero a=\"1\" xml:lang=\"it\">").replace("<DatiGenerali>", "<DatiGenerali id=\"x\">")));
        c.put("maiuscole diverse", byt(fattura(CEDENTE, BODY).replace("Numero>", "numero>")));
        c.put("nome con i due punti di troppo", byt(fattura(CEDENTE, BODY).replace("<Numero>", "<a:b:Numero>").replace("</Numero>", "</a:b:Numero>")));
        c.put("elemento xmlns", byt(fattura(CEDENTE, BODY).replace("<Numero>", "<xmlns:Numero>").replace("</Numero>", "</xmlns:Numero>")));
        c.put("xml 1.1 con un nome ammesso solo li'", byt(fattura(CEDENTE, BODY).replace("version=\"1.0\"", "version=\"1.1\"")
                .replace("<Divisa>EUR</Divisa>", "<Divisa>EUR</Divisa><Ƞx/>").replace("</DatiGeneraliDocumento>", "<Ƞy>1</Ƞy></DatiGeneraliDocumento>")));
        c.put("xml 1.0 con quel nome", byt(fattura(CEDENTE, BODY).replace("</DatiGeneraliDocumento>", "<Ƞy>1</Ƞy></DatiGeneraliDocumento>")));
        c.put("versione sconosciuta", byt(fattura(CEDENTE, BODY).replace("version=\"1.0\"", "version=\"3.0\"")));

        // ---- codifiche e byte ----
        String accenti = fattura(denominazione("Caffè Perché Più Srl €", "1"), BODY);
        c.put("utf-8 con accenti", byt(accenti));
        c.put("utf-8 con bom", unisci(new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF}, byt(accenti)));
        c.put("latin1 dichiarato", accenti.replace("UTF-8", "ISO-8859-1").replace("€", "").getBytes(StandardCharsets.ISO_8859_1));
        c.put("latin1 non dichiarato", accenti.replace("€", "").getBytes(StandardCharsets.ISO_8859_1));
        c.put("windows-1252", accenti.replace("UTF-8", "windows-1252").getBytes("windows-1252"));
        c.put("utf-16", accenti.replace("UTF-8", "UTF-16").getBytes(StandardCharsets.UTF_16));
        c.put("utf-16 dichiarato utf-8", accenti.getBytes(StandardCharsets.UTF_16));
        c.put("codifica sconosciuta", byt(accenti.replace("UTF-8", "KLINGON")));
        c.put("vuoto", new byte[0]);
        c.put("solo spazi", byt("  \n "));
        c.put("solo la dichiarazione", byt("<?xml version=\"1.0\"?>"));
        c.put("zeri", new byte[64]);
        c.put("byte a caso", new byte[]{0x30, (byte) 0x82, 0x13, 0x37, 0x06, 0x09, 0x2A, 0x01, 0x02, (byte) 0xFF, 0x00});
        c.put("due radici", byt(fattura(CEDENTE, BODY) + "<altro/>"));
        c.put("testo dopo la radice", byt(fattura(CEDENTE, BODY) + "\n fine"));
        c.put("commento dopo la radice", byt(fattura(CEDENTE, BODY) + "<!--" + "x".repeat(3_000) + "-->"));
        c.put("dichiarazione non all'inizio", byt("\n" + fattura(CEDENTE, BODY)));
        c.put("annidamento profondo negli allegati", byt(fattura(CEDENTE, BODY.replace("</FatturaElettronicaBody>",
                "<Allegati>" + "<a>".repeat(3_000) + "</a>".repeat(3_000) + "</Allegati></FatturaElettronicaBody>"))));
        c.put("annidamento profondo nel numero", byt(fattura(CEDENTE, BODY.replace("<Numero>", "<Numero>" + "<a>".repeat(3_000) + "7" + "</a>".repeat(3_000)))));
        return c;
    }

    /**
     * Mette un prefisso a tutti gli elementi senza prefisso tranne la radice, a rotazione fra quelli dati («» = nessuno):
     * elementi vicini finiscono in namespace diversi, e la lettura (che guarda solo il nome locale) non deve accorgersene.
     */
    private static String prefissiARotazione(String xml, String... prefissi) {
        StringBuilder s = new StringBuilder();
        java.util.ArrayDeque<String> aperti = new java.util.ArrayDeque<>();
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("<(/?)([A-Za-z][A-Za-z0-9]*)(?=[ />])").matcher(xml);
        int n = 0;
        while (m.find()) {
            String prefisso;
            if (m.group(1).isEmpty()) {
                prefisso = prefissi[n++ % prefissi.length];
                // un elemento vuoto (<x/>) non ha chiusura: non resta aperto
                int fine = xml.indexOf('>', m.end());
                if (xml.charAt(fine - 1) != '/') {
                    aperti.push(prefisso);
                }
            } else {
                prefisso = aperti.pop();
            }
            m.appendReplacement(s, "<" + m.group(1) + (prefisso.isEmpty() ? "" : prefisso + ":") + m.group(2));
        }
        m.appendTail(s);
        return s.toString();
    }

    private static String[] lotto(int quante) {
        String[] corpi = new String[quante];
        for (int i = 0; i < quante; i++) {
            corpi[i] = bodyCompleto(i % 7 == 0 ? "TD04" : "TD01", "L-" + i);
        }
        return corpi;
    }

    private static byte[] unisci(byte[] a, byte[] b) {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        o.writeBytes(a);
        o.writeBytes(b);
        return o.toByteArray();
    }

    @Test
    void suTutteLeFattureDiProvaIlRisultatoELoStessoDiPrima() throws Exception {
        int lette = 0;
        int rifiutate = 0;
        for (Map.Entry<String, byte[]> file : corpus().entrySet()) {
            if (uguali(file.getKey(), file.getValue()).fatture() != null) {
                lette++;
            } else {
                rifiutate++;
            }
        }
        // il confronto deve passare da tutti e due i rami: fatture lette e file rifiutati
        assertThat(lette).isGreaterThan(50);
        assertThat(rifiutate).isGreaterThan(50);
    }

    /** I file di partenza per le varianti: piccoli e completi, uno per tracciato e forma. */
    private static Map<String, byte[]> daVariare() {
        Map<String, byte[]> c = new LinkedHashMap<>();
        c.put("ordinaria", byt(fattura(CEDENTE, bodyCompleto("TD01", "C-1"))));
        c.put("ordinaria con tre prefissi", byt(prefissiARotazione(fattura(CEDENTE, bodyCompleto("TD01", "C-1"))
                .replace("<FatturaElettronica ", "<a:FatturaElettronica xmlns:a=\"urn:a\" xmlns:b=\"urn:b\" xmlns:c=\"urn:c\" ")
                .replace("</FatturaElettronica>", "</a:FatturaElettronica>"), "a", "b", "c")));
        c.put("ordinaria con prefisso, lotto", byt(fatturaConPrefisso("p", persona("Mario", "Bianchi", "09876543210"),
                bodyCompleto("TD01", "C-1"), body("TD04", "C-2", "2026-10-04", null, "50.00", "11.00"))));
        c.put("semplificata", byt(semplificata("p", CEDENTE_S, "TD07", "S-12", "2026-10-06",
                rigaSemplificata("Viti", "36.60", "6.60", null), rigaSemplificata("Pane", "10.00", null, "10.00"), ALLEGATI)));
        c.put("semplificata persona", byt(semplificata("", "<CedentePrestatore><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01928374650</IdCodice>"
                + "</IdFiscaleIVA><Nome>Luca</Nome><Cognome>Verdi</Cognome></CedentePrestatore>", "TD08", "1", "2026-10-06",
                rigaSemplificata("Reso", "12.20", "2.20", null))));
        return c;
    }

    @Test
    void ilFileTroncatoInOgniPuntoDaLoStessoErroreDiPrima() {
        int provati = 0;
        for (Map.Entry<String, byte[]> file : daVariare().entrySet()) {
            byte[] xml = file.getValue();
            for (int fine = 0; fine < xml.length; fine++) {
                uguali(file.getKey() + " troncato a " + fine, java.util.Arrays.copyOf(xml, fine));
                provati++;
            }
        }
        assertThat(provati).isGreaterThan(5_000);
    }

    /** Pezzi estranei: gli elementi che la lettura cerca (messi dove non li cerca, o in piu'), quelli che non tiene, testo, errori. */
    private static final List<String> PEZZI = List.of(
            ALLEGATI,
            "<Allegati><Attachment>QUJD",                // non chiuso: il file diventa non valido
            DETTAGLIO,
            "testo",
            "<Numero>INSERITO</Numero>",
            "<Data>2020-01-01</Data>",
            "<TipoDocumento>TD99</TipoDocumento>",
            "<ImportoTotaleDocumento>999.99</ImportoTotaleDocumento>",
            "<Denominazione>Inserita Srl</Denominazione>",
            "<Nome>Inserito</Nome><Cognome>Inserito</Cognome>",
            "<IdFiscaleIVA><IdCodice>99999999999</IdCodice></IdFiscaleIVA>",
            "<Importo>7.77</Importo>",
            "<Imposta>0.77</Imposta>",
            "<Aliquota>4.00</Aliquota>",
            "<ImponibileImporto>3.33</ImponibileImporto>",
            "<DatiIVA><Imposta>0.11</Imposta></DatiIVA>",
            "<DatiRiepilogo><ImponibileImporto>1.00</ImponibileImporto><Imposta>0.22</Imposta></DatiRiepilogo>",
            "<DatiBeniServizi><Importo>5.00</Importo><DatiRiepilogo><ImponibileImporto>4.00</ImponibileImporto><Imposta>1.00</Imposta></DatiRiepilogo></DatiBeniServizi>",
            "<DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD05</TipoDocumento><Data>2021-02-02</Data><Numero>DG</Numero></DatiGeneraliDocumento></DatiGenerali>",
            "<DatiGeneraliDocumento><Numero>DGD</Numero></DatiGeneraliDocumento>",
            "<DatiAnagrafici><Anagrafica><Denominazione>Altra</Denominazione></Anagrafica></DatiAnagrafici>",
            "<Anagrafica><Denominazione>Altra ancora</Denominazione></Anagrafica>",
            "<CedentePrestatore><Denominazione>Cedente inserito</Denominazione></CedentePrestatore>",
            "<FatturaElettronicaHeader><CedentePrestatore><Denominazione>Intestazione inserita</Denominazione></CedentePrestatore></FatturaElettronicaHeader>",
            "<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>2022-03-03</Data><Numero>B</Numero>"
                    + "</DatiGeneraliDocumento></DatiGenerali><DatiBeniServizi><Importo>1.00</Importo></DatiBeniServizi></FatturaElettronicaBody>",
            "<FatturaElettronicaBody/>",
            "<DatiRiepilogo/>",
            "<DatiBeniServizi/>",
            "<DatiGenerali/>",
            "<Data/>",
            "<Numero><a>IN</a><Allegati>SE</Allegati>RITO</Numero>",
            "<z:DatiRiepilogo xmlns:z=\"urn:z\"><z:ImponibileImporto>2.00</z:ImponibileImporto><Imposta>0.44</Imposta></z:DatiRiepilogo>",
            "<z:Numero xmlns:z=\"urn:z\">PREFISSO</z:Numero>",
            "<z:FatturaElettronicaBody xmlns:z=\"urn:z\"><z:DatiGenerali><DatiGeneraliDocumento><z:TipoDocumento>TD01</z:TipoDocumento><z:Data>2023-04-04</z:Data>"
                    + "<Numero>Z</Numero></DatiGeneraliDocumento></z:DatiGenerali><z:DatiBeniServizi><z:Importo>2.00</z:Importo></z:DatiBeniServizi></z:FatturaElettronicaBody>");

    @Test
    void unPezzoEstraneoInOgniPuntoDaLoStessoRisultatoDiPrima() {
        int provati = 0;
        int lette = 0;
        List<String> diverseDallOriginale = new ArrayList<>();
        for (Map.Entry<String, byte[]> file : daVariare().entrySet()) {
            String xml = new String(file.getValue(), StandardCharsets.UTF_8);
            Esito originale = uguali(file.getKey(), file.getValue());
            for (int dopo = xml.indexOf('>'); dopo >= 0; dopo = xml.indexOf('>', dopo + 1)) {
                for (String pezzo : PEZZI) {
                    String nome = file.getKey() + " con " + pezzo + " alla posizione " + (dopo + 1);
                    Esito esito = uguali(nome, byt(xml.substring(0, dopo + 1) + pezzo + xml.substring(dopo + 1)));
                    provati++;
                    if (esito.fatture() != null) {
                        lette++;
                    }
                    if (!esito.equals(originale)) {
                        diverseDallOriginale.add(nome);
                    }
                }
            }
        }
        assertThat(provati).isGreaterThan(5_000);
        assertThat(lette).isGreaterThan(1_000);
        // le varianti non sono innocue: molte cambiano davvero quello che si legge (altrimenti il confronto proverebbe poco)
        assertThat(diverseDallOriginale).hasSizeGreaterThan(500);
    }
}
