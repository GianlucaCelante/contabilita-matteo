package it.contabilita.importa;

import it.contabilita.importa.ParserFatturaPa.DatiFattura;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;

import static it.contabilita.importa.FattureProva.body;
import static it.contabilita.importa.FattureProva.byt;
import static it.contabilita.importa.FattureProva.denominazione;
import static it.contabilita.importa.FattureProva.fattura;
import static it.contabilita.importa.FattureProva.fatturaConPrefisso;
import static it.contabilita.importa.FattureProva.persona;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ParserFatturaPaTest {

    @Test
    void leggeUnaFatturaConDenominazione() throws Exception {
        List<DatiFattura> l = ParserFatturaPa.leggi(byt(fattura(denominazione("Forno Rossi Srl", "01234567890"),
                body("TD01", "FT-12/A", "2026-10-03", "122.00", "100.00", "22.00"))));
        assertThat(l).hasSize(1);
        DatiFattura f = l.get(0);
        assertThat(f.fornitoreNome()).isEqualTo("Forno Rossi Srl");
        assertThat(f.partitaIva()).isEqualTo("01234567890");
        assertThat(f.tipoDocumento()).isEqualTo("TD01");
        assertThat(f.numero()).isEqualTo("FT-12/A");
        assertThat(f.data()).isEqualTo(LocalDate.of(2026, 10, 3));
        assertThat(f.imponibileCent()).isEqualTo(10000);
        assertThat(f.ivaCent()).isEqualTo(2200);
        assertThat(f.totaleCent()).isEqualTo(12200);
    }

    @Test
    void conNomeECognomeLiUnisce() throws Exception {
        DatiFattura f = ParserFatturaPa.leggi(byt(fattura(persona("Mario", "Bianchi", "09876543210"),
                body("TD01", "7", "2026-01-15", "50.00", "40.98", "9.02")))).get(0);
        assertThat(f.fornitoreNome()).isEqualTo("Mario Bianchi");
    }

    @Test
    void leggePerNomeLocaleQualunqueSiaIlPrefisso() throws Exception {
        for (String prefisso : new String[]{"p", "ns3", "ns2", "a"}) {
            DatiFattura f = ParserFatturaPa.leggi(byt(fatturaConPrefisso(prefisso, denominazione("Cantina Verdi", "11111111111"),
                    body("TD01", "9", "2026-02-01", "10.00", "8.20", "1.80")))).get(0);
            assertThat(f.fornitoreNome()).as(prefisso).isEqualTo("Cantina Verdi");
            assertThat(f.totaleCent()).as(prefisso).isEqualTo(1000);
        }
    }

    @Test
    void unLottoDaUnaFatturaPerBody() throws Exception {
        List<DatiFattura> l = ParserFatturaPa.leggi(byt(fattura(denominazione("Grossista Neri", "22222222222"),
                body("TD01", "1", "2026-03-01", "122.00", "100.00", "22.00"),
                body("TD01", "2", "2026-03-02", "61.00", "50.00", "11.00"))));
        assertThat(l).extracting(DatiFattura::numero).containsExactly("1", "2");
        assertThat(l).extracting(DatiFattura::totaleCent).containsExactly(12200L, 6100L);
    }

    @Test
    void senzaTotaleDelDocumentoEImponibilePiuIvaESommaPiuRiepiloghi() throws Exception {
        String due = "<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento>"
                + "<Data>2026-04-04</Data><Numero>5</Numero></DatiGeneraliDocumento></DatiGenerali>"
                + "<DatiBeniServizi><DatiRiepilogo><ImponibileImporto>10.10</ImponibileImporto><Imposta>2.22</Imposta></DatiRiepilogo>"
                + "<DatiRiepilogo><ImponibileImporto>20.20</ImponibileImporto><Imposta>0.00</Imposta></DatiRiepilogo>"
                + "</DatiBeniServizi></FatturaElettronicaBody>";
        DatiFattura f = ParserFatturaPa.leggi(byt(fattura(denominazione("X", "1"), due))).get(0);
        assertThat(f.imponibileCent()).isEqualTo(3030);
        assertThat(f.ivaCent()).isEqualTo(222);
        assertThat(f.totaleCent()).isEqualTo(3252);
    }

    @Test
    void gliImportiDecimaliNonPerdonoCentesimi() throws Exception {
        DatiFattura f = ParserFatturaPa.leggi(byt(fattura(denominazione("X", "1"),
                body("TD01", "1", "2026-04-04", "1234567.89", "0.10", "0.20")))).get(0);
        assertThat(f.totaleCent()).isEqualTo(123456789L);
        assertThat(f.imponibileCent()).isEqualTo(10);
        assertThat(f.ivaCent()).isEqualTo(20);
        // 4 decimali (capita nei prezzi unitari): si arrotonda al centesimo, mai con i double
        DatiFattura g = ParserFatturaPa.leggi(byt(fattura(denominazione("X", "1"),
                body("TD01", "1", "2026-04-04", "0.30", "0.1500", "0.1500")))).get(0);
        assertThat(g.imponibileCent()).isEqualTo(15);
    }

    @Test
    void riportaIlTipoDelDocumentoAncheSeNonAmmesso() throws Exception {
        DatiFattura f = ParserFatturaPa.leggi(byt(fattura(denominazione("X", "1"),
                body("TD04", "1", "2026-04-04", "10.00", "8.20", "1.80")))).get(0);
        assertThat(f.tipoDocumento()).isEqualTo("TD04");
    }

    @Test
    void fileNonXmlOSenzaDatiUtiliDannoErroreChiaro() {
        assertThatThrownBy(() -> ParserFatturaPa.leggi(byt("questo non è xml")))
                .isInstanceOf(ParserFatturaPa.ErroreLettura.class)
                .hasMessageContaining("fattura elettronica") // il messaggio lo legge il cliente: niente «XML»
                .hasMessageNotContaining("XML");
        assertThatThrownBy(() -> ParserFatturaPa.leggi(byt("<?xml version=\"1.0\"?><altro><a/></altro>")))
                .isInstanceOf(ParserFatturaPa.ErroreLettura.class).hasMessage("Il file non è una fattura elettronica.");
        assertThatThrownBy(() -> ParserFatturaPa.leggi(byt(fattura(denominazione("X", "1")))))
                .isInstanceOf(ParserFatturaPa.ErroreLettura.class);
        assertThatThrownBy(() -> ParserFatturaPa.leggi(byt(fattura("<CedentePrestatore/>",
                body("TD01", "1", "2026-04-04", "10.00", "8.20", "1.80")))))
                .isInstanceOf(ParserFatturaPa.ErroreLettura.class).hasMessageContaining("fornitore");
        assertThatThrownBy(() -> ParserFatturaPa.leggi(byt(fattura(denominazione("X", "1"),
                body("TD01", "1", "31/12/2026", "10.00", "8.20", "1.80")))))
                .isInstanceOf(ParserFatturaPa.ErroreLettura.class).hasMessageContaining("data");
        assertThatThrownBy(() -> ParserFatturaPa.leggi(byt(fattura(denominazione("X", "1"),
                body("TD01", "1", "2026-04-04", "abc", "8.20", "1.80")))))
                .isInstanceOf(ParserFatturaPa.ErroreLettura.class);
    }

    @Test
    void xxeConEntitaEsternaERifiutatoSenzaLeggereFileLocali(@TempDir Path cartella) throws Exception {
        Path segreto = cartella.resolve("segreto.txt");
        Files.writeString(segreto, "CONTENUTO-SEGRETO");
        String xml = "<?xml version=\"1.0\"?>\n<!DOCTYPE FatturaElettronica [<!ENTITY xxe SYSTEM \"" + segreto.toUri() + "\">]>\n"
                + fattura(denominazione("&xxe;", "1"), body("TD01", "1", "2026-04-04", "10.00", "8.20", "1.80"))
                .replace("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n", "");
        assertThatThrownBy(() -> ParserFatturaPa.leggi(xml.getBytes(StandardCharsets.UTF_8)))
                .isInstanceOf(ParserFatturaPa.ErroreLettura.class)
                .satisfies(e -> assertThat(e.getMessage()).doesNotContain("CONTENUTO-SEGRETO"));
    }

    @Test
    void xxeConDtdEsternaViaReteERifiutato() {
        String xml = "<?xml version=\"1.0\"?>\n<!DOCTYPE FatturaElettronica SYSTEM \"http://127.0.0.1:1/x.dtd\">\n<FatturaElettronica/>";
        assertThatThrownBy(() -> ParserFatturaPa.leggi(byt(xml))).isInstanceOf(ParserFatturaPa.ErroreLettura.class)
                .hasMessage("Il file contiene istruzioni non ammesse e non è stato letto.");
    }

    @Test
    void billionLaughsEFermatoDalDivietoDiDoctype() {
        String xml = "<?xml version=\"1.0\"?><!DOCTYPE lolz [<!ENTITY a \"aaaaaaaaaa\"><!ENTITY b \"&a;&a;&a;&a;&a;&a;&a;&a;\">]><lolz>&b;</lolz>";
        assertThatThrownBy(() -> ParserFatturaPa.leggi(byt(xml))).isInstanceOf(ParserFatturaPa.ErroreLettura.class);
    }

    // s35: i messaggi li legge il cliente. Niente nomi dei campi del tracciato, sigle o numeri di riga: quelli restano nel dettaglio (log).
    private static final java.util.regex.Pattern GERGO = java.util.regex.Pattern.compile(
            "FatturaPA|XML|DOCTYPE|DTD|entità|TD\\d\\d|CedentePrestatore|Denominazione|DatiGenerali|FatturaElettronicaBody|Importo[A-Z]|Imposta|riga \\d");

    private static ParserFatturaPa.ErroreLettura errore(String xml) {
        try {
            ParserFatturaPa.leggi(byt(xml));
        } catch (ParserFatturaPa.ErroreLettura e) {
            assertThat(GERGO.matcher(e.getMessage()).find()).as("gergo in «%s»", e.getMessage()).isFalse();
            return e;
        }
        throw new AssertionError("la lettura doveva fallire");
    }

    @Test
    void iMessaggiPerIlClienteSonoInItalianoSempliceEIlDettaglioTecnicoRestaAParte() {
        String ok = denominazione("X", "1");
        assertThat(errore("riga uno\nquesto non è xml")).hasMessage("Il file non è una fattura elettronica valida.")
                .satisfies(e -> assertThat(e.dettaglio()).contains("riga 1"));
        assertThat(errore("<?xml version=\"1.0\"?><altro><a/></altro>")).hasMessage("Il file non è una fattura elettronica.")
                .satisfies(e -> assertThat(e.dettaglio()).contains("altro"));
        assertThat(errore("<?xml version=\"1.0\"?><!DOCTYPE x [<!ENTITY a \"b\">]><x/>"))
                .hasMessage("Il file contiene istruzioni non ammesse e non è stato letto.")
                .satisfies(e -> assertThat(e.dettaglio()).contains("DOCTYPE"));
        assertThat(errore(fattura("<CedentePrestatore/>", body("TD01", "1", "2026-04-04", "10.00", "8.20", "1.80"))))
                .hasMessage("Nella fattura manca il nome del fornitore.")
                .satisfies(e -> assertThat(e.dettaglio()).contains("CedentePrestatore"));
        assertThat(errore(fattura("<CedentePrestatore><DatiAnagrafici><Anagrafica/></DatiAnagrafici></CedentePrestatore>",
                body("TD01", "1", "2026-04-04", "10.00", "8.20", "1.80"))))
                .hasMessage("Nella fattura manca il nome del fornitore.")
                .satisfies(e -> assertThat(e.dettaglio()).contains("Denominazione"));
        assertThat(errore(fattura(ok))).hasMessage("Il file non contiene nessuna fattura.")
                .satisfies(e -> assertThat(e.dettaglio()).contains("FatturaElettronicaBody"));
        assertThat(errore(fattura(ok, "<FatturaElettronicaBody><DatiGenerali/></FatturaElettronicaBody>")))
                .hasMessage("Nella fattura mancano numero e data.")
                .satisfies(e -> assertThat(e.dettaglio()).contains("DatiGeneraliDocumento"));
        assertThat(errore(fattura(ok, body("TD01", "", "2026-04-04", "10.00", "8.20", "1.80")))).hasMessage("Manca il numero della fattura.");
        assertThat(errore(fattura(ok, body("TD01", "1", "31/12/2026", "10.00", "8.20", "1.80"))))
                .hasMessage("La data della fattura manca o non è valida: «31/12/2026».");
        assertThat(errore(fattura(ok, body("TD01", "1", "2026-04-04", "abc", "8.20", "1.80"))))
                .hasMessage("Il totale della fattura non è un importo valido: «abc».")
                .satisfies(e -> assertThat(e.dettaglio()).contains("ImportoTotaleDocumento"));
        assertThat(errore(fattura(ok, body("TD01", "1", "2026-04-04", "10.00", "x", "1.80"))))
                .hasMessage("L'imponibile della fattura non è un importo valido: «x».")
                .satisfies(e -> assertThat(e.dettaglio()).contains("ImponibileImporto"));
        assertThat(errore(fattura(ok, body("TD01", "1", "2026-04-04", "10.00", "8.20", "y"))))
                .hasMessage("L'IVA della fattura non è un importo valido: «y».")
                .satisfies(e -> assertThat(e.dettaglio()).contains("Imposta"));
    }
}
