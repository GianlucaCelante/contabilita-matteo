package it.contabilita.importa;

import it.contabilita.importa.LettoreFile.Risultato;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static it.contabilita.importa.FattureProva.body;
import static it.contabilita.importa.FattureProva.byt;
import static it.contabilita.importa.FattureProva.denominazione;
import static it.contabilita.importa.FattureProva.fattura;
import static it.contabilita.importa.FattureProva.voci;
import static it.contabilita.importa.FattureProva.zip;
import static org.assertj.core.api.Assertions.assertThat;

class LettoreFileTest {

    private final LettoreFile lettore = new LettoreFile();
    private final String xml = fattura(denominazione("Forno Rossi Srl", "01234567890"),
            body("TD01", "1", "2026-10-03", "122.00", "100.00", "22.00"));

    @Test
    void unXmlSingoloEUnP7mSingolo() {
        Risultato r = lettore.leggi("a.xml", byt(xml));
        assertThat(r.errori()).isEmpty();
        assertThat(r.file()).hasSize(1);
        assertThat(r.file().get(0).xml()).isEqualTo(byt(xml));
        assertThat(r.file().get(0).originale()).isEqualTo(byt(xml));
        assertThat(r.file().get(0).nomeAllegato()).isEqualTo("a.xml");

        byte[] p7m = FattureProva.p7mContiguo(byt(xml));
        Risultato p = lettore.leggi("b.XML.P7M", p7m);
        assertThat(p.errori()).isEmpty();
        assertThat(p.file().get(0).xml()).isEqualTo(byt(xml));
        assertThat(p.file().get(0).originale()).isEqualTo(p7m); // l'allegato e' il p7m originale
        assertThat(p.file().get(0).nomeAllegato()).isEqualTo("b.XML.P7M");
    }

    @Test
    void unTipoNonSupportatoVaInErrori() {
        Risultato r = lettore.leggi("foto.jpg", new byte[]{1, 2, 3});
        assertThat(r.file()).isEmpty();
        assertThat(r.errori()).singleElement().satisfies(e -> {
            assertThat(e.nomeFile()).isEqualTo("foto.jpg");
            assertThat(e.messaggio()).contains(".xml");
        });
    }

    // Lo zip esportato da Fatture in Cloud ha, dopo ogni voce, un descrittore con la dimensione a zero (quelle vere stanno
    // solo nell'indice finale): una lettura "a flusso" lo rifiuta come danneggiato, l'indice invece e' corretto.
    @Test
    void unZipConDescrittoriDallaDimensioneZeroSiLegge() throws Exception {
        byte[] z = zip(voci(
                "Fatture in Cloud/lista clienti.xlsx", new byte[]{1, 2, 3, 4},
                "Fatture in Cloud/acquisti elettronici/01_gennaio/a.xml", xml,
                "Fatture in Cloud/acquisti elettronici/02_febbraio/b.xml", xml.replace("<Numero>1<", "<Numero>2<")));
        azzeraDimensioniNeiDescrittori(z);

        Risultato r = lettore.leggi("2026.zip", z);
        assertThat(r.errori()).isEmpty();
        assertThat(r.file()).extracting(LettoreFile.FileXml::xml).containsExactly(byt(xml), byt(xml.replace("<Numero>1<", "<Numero>2<")));
        assertThat(r.file()).extracting(LettoreFile.FileXml::nomeAllegato).containsExactly("a.xml", "b.xml");
    }

    /** Scrive 0 nella dimensione decompressa di ogni descrittore dati (firma PK\8: crc, dimensione compressa, dimensione). */
    private static void azzeraDimensioniNeiDescrittori(byte[] zip) {
        for (int i = 0; i + 16 <= zip.length; i++) {
            if (zip[i] == 'P' && zip[i + 1] == 'K' && zip[i + 2] == 7 && zip[i + 3] == 8) {
                zip[i + 12] = zip[i + 13] = zip[i + 14] = zip[i + 15] = 0;
            }
        }
    }

    @Test
    void unZipConPiuXmlEP7mAncheInSottocartelle() throws Exception {
        byte[] z = zip(voci(
                "a.xml", xml,
                "sotto/cartella/b.xml", xml.replace("<Numero>1<", "<Numero>2<"),
                "firmate/c.xml.p7m", FattureProva.p7mABlocchi(byt(xml), 64)));
        Risultato r = lettore.leggi("fatture.zip", z);
        assertThat(r.errori()).isEmpty();
        assertThat(r.file()).extracting(LettoreFile.FileXml::nomeAllegato).containsExactly("a.xml", "b.xml", "c.xml.p7m");
        assertThat(r.file()).extracting(LettoreFile.FileXml::nomeFile)
                .containsExactly("fatture.zip › a.xml", "fatture.zip › sotto/cartella/b.xml", "fatture.zip › firmate/c.xml.p7m");
    }

    @Test
    void ignoraIlRestoSenzaErrori() throws Exception {
        byte[] z = zip(voci(
                "__MACOSX/._a.xml", "garbage",
                ".DS_Store", "x",
                "dir/.DS_Store", "x",
                "note.txt", "ciao",
                "foto.png", new byte[]{(byte) 0x89, 'P', 'N', 'G'},
                "interno.zip", new byte[]{'P', 'K'},
                "a.xml", xml));
        Risultato r = lettore.leggi("x.zip", z);
        assertThat(r.errori()).isEmpty();
        assertThat(r.file()).hasSize(1);
    }

    @Test
    void ilZipSlipEScartatoENonScrivePiuNullaSuDisco() throws Exception {
        byte[] z = zip(voci("../fuori.xml", xml, "..\\altro.xml", xml, "/assoluto.xml", xml, "C:/win.xml", xml, "ok/b.xml", xml));
        Risultato r = lettore.leggi("x.zip", z);
        assertThat(r.file()).extracting(LettoreFile.FileXml::nomeAllegato).containsExactly("b.xml");
        assertThat(r.errori()).hasSize(4).allSatisfy(e -> assertThat(e.messaggio()).contains("non valido"));
    }

    @Test
    void troppiFileNelloZipRifiutaLArchivio() throws Exception {
        LettoreFile piccolo = new LettoreFile(3, 1_000_000, 10_000_000);
        byte[] z = zip(voci("1.xml", xml, "2.xml", xml, "3.xml", xml, "4.xml", xml));
        Risultato r = piccolo.leggi("x.zip", z);
        assertThat(r.file()).isEmpty();
        assertThat(r.errori()).singleElement().satisfies(e -> assertThat(e.messaggio()).contains("troppi file"));
    }

    @Test
    void unFileTroppoGrandeDecompressoRifiutaLArchivioSenzaDecomprimereTutto() throws Exception {
        LettoreFile piccolo = new LettoreFile(10, 1_000, 10_000_000);
        byte[] z = zip(voci("a.xml", xml, "bomba.xml", new byte[50_000_000])); // 50 MB di zeri: lo zip pesa pochi KB
        assertThat(z.length).isLessThan(100_000);
        Risultato r = piccolo.leggi("x.zip", z);
        assertThat(r.file()).isEmpty();
        assertThat(r.errori()).singleElement().satisfies(e -> assertThat(e.messaggio()).contains("bomba.xml").contains("troppo grande"));
    }

    @Test
    void ilLimiteDelTotaleDecompressoRifiutaLArchivio() throws Exception {
        LettoreFile piccolo = new LettoreFile(100, 10_000, 15_000);
        byte[] z = zip(voci("a.xml", new byte[9_000], "b.xml", new byte[9_000]));
        Risultato r = piccolo.leggi("x.zip", z);
        assertThat(r.file()).isEmpty();
        assertThat(r.errori()).singleElement().satisfies(e -> assertThat(e.messaggio()).contains("totale"));
    }

    @Test
    void ilLimitePredefinitoPerFileEVentiMegabyte() throws Exception {
        Risultato r = lettore.leggi("x.zip", zip(voci("grande.xml", new byte[21 * 1024 * 1024])));
        assertThat(r.file()).isEmpty();
        assertThat(r.errori()).singleElement().satisfies(e -> assertThat(e.messaggio()).contains("20 MB"));
    }

    @Test
    void unoZipDanneggiatoOVuotoVaInErrori() throws Exception {
        Risultato danneggiato = lettore.leggi("x.zip", new byte[]{'P', 'K', 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32});
        assertThat(danneggiato.file()).isEmpty();
        assertThat(danneggiato.errori()).hasSize(1);
        Risultato vuoto = lettore.leggi("v.zip", zip(Map.of("note.txt", byt("x"))));
        assertThat(vuoto.errori()).singleElement().satisfies(e -> assertThat(e.messaggio()).contains("nessuna fattura"));
    }
}
