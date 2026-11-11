package it.contabilita.importa;

import it.contabilita.importa.ParserFatturaPa.DatiFattura;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static it.contabilita.importa.FattureProva.byt;
import static it.contabilita.importa.FattureProva.cedenteSemplificato;
import static it.contabilita.importa.FattureProva.rigaSemplificata;
import static it.contabilita.importa.FattureProva.semplificata;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * La fattura semplificata (tracciato {@code FatturaElettronicaSemplificata}, versione FSM10: TD07, TD08, TD09). XML scritti a
 * mano secondo le specifiche dell'Agenzia delle Entrate, con dati inventati: il cedente ha partita IVA e nome come figli
 * diretti, ogni {@code DatiBeniServizi} ha un {@code Importo} IVA compresa e {@code DatiIVA} con l'imposta oppure l'aliquota,
 * e il totale del documento non e' scritto.
 */
class ParserSemplificataTest {

    private static final String CEDENTE = cedenteSemplificato("Ferramenta Bianchi Snc", "02468013579");

    @Test
    void leggeFornitoreNumeroDataEIlTotaleComeSommaDelleRighe() throws Exception {
        List<DatiFattura> lette = ParserFatturaPa.leggi(byt(semplificata("p", CEDENTE, "TD07", "S-12", "2026-10-06",
                rigaSemplificata("Viti e tasselli", "36.60", "6.60", null),
                rigaSemplificata("Colla", "10.00", "1.80", null))));
        assertThat(lette).hasSize(1);
        DatiFattura f = lette.get(0);
        assertThat(f.fornitoreNome()).isEqualTo("Ferramenta Bianchi Snc");
        assertThat(f.partitaIva()).isEqualTo("02468013579");
        assertThat(f.tipoDocumento()).isEqualTo("TD07");
        assertThat(f.numero()).isEqualTo("S-12");
        assertThat(f.data()).isEqualTo(LocalDate.of(2026, 10, 6));
        assertThat(f.totaleCent()).isEqualTo(4660);
        assertThat(f.ivaCent()).isEqualTo(840);
        assertThat(f.imponibileCent()).isEqualTo(3820);
    }

    @Test
    void conLaSolaAliquotaLIvaSiScorporaDallImporto() throws Exception {
        // 12,20 con il 22%: 2,20 di IVA; 10,00 con il 10%: 0,91 (0,9090… arrotondato al centesimo)
        DatiFattura f = ParserFatturaPa.leggi(byt(semplificata("", CEDENTE, "TD07", "1", "2026-10-06",
                rigaSemplificata("Nastro", "12.20", null, "22.00"),
                rigaSemplificata("Pane", "10.00", null, "10.00")))).get(0);
        assertThat(f.totaleCent()).isEqualTo(2220);
        assertThat(f.ivaCent()).isEqualTo(311);
        assertThat(f.imponibileCent()).isEqualTo(1909);
    }

    @Test
    void seCiSonoImpostaEAliquotaValeLImpostaScritta() throws Exception {
        DatiFattura f = ParserFatturaPa.leggi(byt(semplificata("", CEDENTE, "TD07", "1", "2026-10-06",
                rigaSemplificata("Nastro", "12.20", "2.19", "22.00")))).get(0);
        assertThat(f.ivaCent()).isEqualTo(219);
        assertThat(f.imponibileCent()).isEqualTo(1001);
    }

    @Test
    void unaRigaSenzaIvaContaTuttaComeImponibile() throws Exception {
        String esente = "<DatiBeniServizi><Descrizione>Corso</Descrizione><Importo>50.00</Importo><Natura>N4</Natura></DatiBeniServizi>";
        DatiFattura f = ParserFatturaPa.leggi(byt(semplificata("", CEDENTE, "TD07", "1", "2026-10-06", esente))).get(0);
        assertThat(f.totaleCent()).isEqualTo(5000);
        assertThat(f.ivaCent()).isZero();
        assertThat(f.imponibileCent()).isEqualTo(5000);
    }

    @Test
    void unImpostaNegativaOPiuGrandeDellImportoNonSiAccetta() {
        for (String imposta : List.of("-2.20", "12.21", "50.00")) {
            assertThatThrownBy(() -> ParserFatturaPa.leggi(byt(semplificata("", CEDENTE, "TD07", "1", "2026-10-06",
                    rigaSemplificata("Viti", "36.60", "6.60", null), rigaSemplificata("Nastro", "12.20", imposta, null)))))
                    .as(imposta).isInstanceOf(ParserFatturaPa.ErroreLettura.class)
                    .hasMessage("L'IVA della fattura non è coerente con il totale.");
        }
    }

    @Test
    void unImpostaUgualeAZeroOAllImportoResta() throws Exception {
        DatiFattura f = ParserFatturaPa.leggi(byt(semplificata("", CEDENTE, "TD07", "1", "2026-10-06",
                rigaSemplificata("Esente", "10.00", "0.00", null), rigaSemplificata("Solo IVA", "2.20", "2.20", null)))).get(0);
        assertThat(f.totaleCent()).isEqualTo(1220);
        assertThat(f.ivaCent()).isEqualTo(220);
        assertThat(f.imponibileCent()).isEqualTo(1000);
    }

    @Test
    void ilFornitorePersonaHaNomeECognome() throws Exception {
        String persona = "<CedentePrestatore><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01928374650</IdCodice></IdFiscaleIVA>"
                + "<Nome>Luca</Nome><Cognome>Verdi</Cognome><RegimeFiscale>RF19</RegimeFiscale></CedentePrestatore>";
        DatiFattura f = ParserFatturaPa.leggi(byt(semplificata("ns2", persona, "TD07", "1", "2026-10-06",
                rigaSemplificata("Riparazione", "61.00", "11.00", null)))).get(0);
        assertThat(f.fornitoreNome()).isEqualTo("Luca Verdi");
        assertThat(f.partitaIva()).isEqualTo("01928374650");
    }

    @Test
    void riportaIlTipoAncheDiNoteDiCreditoEDiDebitoSemplificate() throws Exception {
        for (String tipo : List.of("TD08", "TD09")) {
            DatiFattura f = ParserFatturaPa.leggi(byt(semplificata("", CEDENTE, tipo, "1", "2026-10-06",
                    rigaSemplificata("Reso", "12.20", "2.20", null)))).get(0);
            assertThat(f.tipoDocumento()).isEqualTo(tipo);
            assertThat(f.totaleCent()).isEqualTo(1220);
        }
    }

    @Test
    void senzaRigheOSenzaImportoNonSiInventaUnTotale() {
        assertThatThrownBy(() -> ParserFatturaPa.leggi(byt(semplificata("", CEDENTE, "TD07", "1", "2026-10-06"))))
                .isInstanceOf(ParserFatturaPa.ErroreLettura.class).hasMessage("Nella fattura manca il totale.");
        assertThatThrownBy(() -> ParserFatturaPa.leggi(byt(semplificata("", CEDENTE, "TD07", "1", "2026-10-06",
                rigaSemplificata("Viti", null, "2.20", null)))))
                .isInstanceOf(ParserFatturaPa.ErroreLettura.class).hasMessage("Nella fattura manca il totale.");
        assertThatThrownBy(() -> ParserFatturaPa.leggi(byt(semplificata("", CEDENTE, "TD07", "1", "2026-10-06",
                rigaSemplificata("Viti", "dodici", "2.20", null)))))
                .isInstanceOf(ParserFatturaPa.ErroreLettura.class).hasMessageContaining("non è un importo valido");
        assertThatThrownBy(() -> ParserFatturaPa.leggi(byt(semplificata("", CEDENTE, "TD07", "1", "2026-10-06",
                rigaSemplificata("Viti", "12.20", null, "ventidue")))))
                .isInstanceOf(ParserFatturaPa.ErroreLettura.class).hasMessage("L'aliquota IVA della fattura non è valida: «ventidue».");
        assertThatThrownBy(() -> ParserFatturaPa.leggi(byt(semplificata("", CEDENTE, "TD07", "1", "2026-10-06",
                rigaSemplificata("Viti", "12.20", null, "-22.00")))))
                .isInstanceOf(ParserFatturaPa.ErroreLettura.class).hasMessage("L'aliquota IVA della fattura non è valida: «-22.00».");
        assertThatThrownBy(() -> ParserFatturaPa.leggi(byt(semplificata("", "<CedentePrestatore><RegimeFiscale>RF01</RegimeFiscale></CedentePrestatore>",
                "TD07", "1", "2026-10-06", rigaSemplificata("Viti", "12.20", "2.20", null)))))
                .isInstanceOf(ParserFatturaPa.ErroreLettura.class).hasMessage("Nella fattura manca il nome del fornitore.");
    }
}
