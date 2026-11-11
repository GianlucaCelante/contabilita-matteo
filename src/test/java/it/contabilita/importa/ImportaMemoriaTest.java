package it.contabilita.importa;

import it.contabilita.allegati.AllegatiService;
import it.contabilita.api.ErroreApi;
import it.contabilita.dati.FornitoreRepository;
import it.contabilita.dati.MovimentoRepository;
import it.contabilita.importa.ImportaDto.Anteprima;
import it.contabilita.importa.ImportaDto.Conferma;
import it.contabilita.importa.ImportaDto.FileCaricato;
import it.contabilita.movimenti.AnagraficheService;
import it.contabilita.movimenti.SediService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.util.unit.DataSize;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static it.contabilita.importa.FattureProva.body;
import static it.contabilita.importa.FattureProva.denominazione;
import static it.contabilita.importa.FattureProva.fattura;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

/**
 * s42: le anteprime tengono in memoria i file originali (da allegare alla conferma). Oltre al numero c'e' un tetto in byte
 * ({@code contabilita.importa.memoria-massima}): quando una nuova anteprima lo fa superare si tolgono le piu' vecchie per
 * ordine d'arrivo, mai quella appena letta e mai alla conferma.
 *
 * <p>Senza Spring: il servizio e' costruito a mano con un tetto di 10 KB (i file pesano 4000 byte) e archivi finti, vuoti.
 * Un'importazione e' ancora in memoria se la conferma (qui senza righe: non salva niente) non risponde 404.
 */
class ImportaMemoriaTest {

    private static final int PESO = 4000;

    private ImportazioneService servizio = servizio(DataSize.ofKilobytes(10));

    private static ImportazioneService servizio(DataSize tetto) {
        return servizio(tetto, DataSize.ofMegabytes(200));
    }

    private static ImportazioneService servizio(DataSize tetto, DataSize lettura) {
        return new ImportazioneService(mock(MovimentoRepository.class), mock(FornitoreRepository.class), mock(AnagraficheService.class),
                mock(AllegatiService.class), mock(SediService.class), mock(PlatformTransactionManager.class),
                Clock.fixed(Instant.parse("2026-01-01T10:00:00Z"), ZoneOffset.UTC), tetto, lettura);
    }

    /** Una fattura di {@code byteTotali} byte esatti: in coda un commento, che per l'XML non conta. */
    private static byte[] file(String numero, int byteTotali) {
        return riempi(fattura(denominazione("Forno Rossi Srl", "01234567890"), body("TD01", numero, "2026-10-03", "122.00", "100.00", "22.00")),
                byteTotali);
    }

    private static byte[] riempi(String xml, int byteTotali) {
        int mancano = byteTotali - xml.getBytes(StandardCharsets.UTF_8).length - "<!---->".length();
        assertThat(mancano).isPositive();
        byte[] b = (xml + "<!--" + "x".repeat(mancano) + "-->").getBytes(StandardCharsets.UTF_8);
        assertThat(b).hasSize(byteTotali);
        return b;
    }

    private String anteprima(byte[]... file) {
        List<FileCaricato> caricati = new ArrayList<>();
        for (int i = 0; i < file.length; i++) {
            caricati.add(new FileCaricato("f" + i + ".xml", file[i]));
        }
        Anteprima a = servizio.anteprima(caricati);
        assertThat(a.errori()).isEmpty();
        assertThat(a.fatture()).isNotEmpty();
        return a.importazioneId();
    }

    private void inMemoria(String id) {
        assertThat(servizio.conferma(new Conferma(id, List.of(), null)).importati()).isZero();
    }

    private void scartata(String id) {
        assertThatThrownBy(() -> servizio.conferma(new Conferma(id, List.of(), null)))
                .isInstanceOfSatisfying(ErroreApi.class, e -> {
                    assertThat(e.getStato()).isEqualTo(HttpStatus.NOT_FOUND);
                    assertThat(e.getMessage()).isEqualTo("L'importazione è scaduta: rileggi i file.");
                });
    }

    @Test
    void oltreIlTettoInByteSiScartaLaPiuVecchiaPerOrdineDArrivo() {
        String prima = anteprima(file("A-1", PESO));
        String seconda = anteprima(file("A-2", PESO)); // 8000 byte: ci stanno
        inMemoria(prima);
        String terza = anteprima(file("A-3", PESO));   // 12000: la prima esce
        scartata(prima);
        inMemoria(seconda);
        inMemoria(terza);
    }

    @Test
    void sottoIlTettoNonSiScartaNienteELaConfermaNonFaPosto() {
        String prima = anteprima(file("B-1", PESO));
        String seconda = anteprima(file("B-2", PESO));
        // nessuna espulsione alla conferma (s39): tutte e due restano, quante volte si vuole e in qualunque ordine
        for (int i = 0; i < 3; i++) {
            inMemoria(seconda);
            inMemoria(prima);
        }
    }

    @Test
    void unAnteprimaCheDaSolaSuperaIlTettoRestaDaSolaFinoAllaSuccessiva() {
        String prima = anteprima(file("C-1", PESO));
        String seconda = anteprima(file("C-2", PESO));
        String enorme = anteprima(file("C-3", 12_000)); // oltre i 10 KB da sola: le altre escono, lei resta
        scartata(prima);
        scartata(seconda);
        inMemoria(enorme);
        String dopo = anteprima(file("C-4", PESO)); // la successiva la sostituisce
        scartata(enorme);
        inMemoria(dopo);
    }

    @Test
    void piuFileNellaStessaAnteprimaSiSommano() {
        String prima = anteprima(file("D-1", PESO));
        String doppia = anteprima(file("D-2", PESO), file("D-3", PESO)); // 4000 + 8000: la prima esce
        scartata(prima);
        inMemoria(doppia);
    }

    @Test
    void ilFileDiUnLottoContaUnaVoltaSolaAncheConPiuFatture() {
        String lotto = fattura(denominazione("Grossista Neri", "22222222222"),
                body("TD01", "E-1", "2026-10-06", "122.00", "100.00", "22.00"),
                body("TD01", "E-2", "2026-10-07", "61.00", "50.00", "11.00"),
                body("TD01", "E-3", "2026-10-08", "61.00", "50.00", "11.00"));
        String prima = anteprima(file("E-0", PESO));
        // tre fatture, un file solo da 4000 byte: 8000 in tutto, la prima resta (contando il file tre volte sarebbe uscita)
        String delLotto = anteprima(riempi(lotto, PESO));
        inMemoria(prima);
        inMemoria(delLotto);
    }

    @Test
    void oltreVentiImportazioniSiScartaLaPiuVecchiaAncheSeIlPesoEPoco() {
        servizio = servizio(DataSize.ofKilobytes(100)); // 21 da 4000 byte: sotto il tetto in byte, ma oltre le 20
        String prima = anteprima(file("F-0", PESO));
        String ultima = null;
        for (int i = 1; i <= 20; i++) {
            ultima = anteprima(file("F-" + i, PESO));
        }
        scartata(prima);
        inMemoria(ultima);
    }

    // ---- s48: quanto si legge in una sola anteprima ----

    @Test
    void iFileDiUnaSolaAnteprimaNonSuperanoIlLimiteDiLettura() {
        servizio = servizio(DataSize.ofMegabytes(1), DataSize.ofBytes(10_000));
        Anteprima a = servizio.anteprima(List.of(new FileCaricato("uno.xml", file("G-1", PESO)), new FileCaricato("due.xml", file("G-2", PESO)),
                new FileCaricato("tre.xml", file("G-3", PESO)), new FileCaricato("piccolo.xml", file("G-4", 1_500))));
        // 4000 + 4000 ci stanno; il terzo porterebbe a 12000 e non si legge; il quarto, piccolo, ci sta ancora
        assertThat(a.fatture()).extracting(f -> f.numero()).containsExactly("G-1", "G-2", "G-4");
        assertThat(a.errori()).singleElement().satisfies(e -> {
            assertThat(e.nomeFile()).isEqualTo("tre.xml");
            assertThat(e.messaggio()).isEqualTo("I file scelti sono troppo grandi tutti insieme (massimo 10000 byte per volta): «tre.xml» non è stato letto. Leggi meno file per volta.");
        });
        inMemoria(a.importazioneId());
    }

    @Test
    void ilLimiteDiLetturaValeAncheFraUnoZipEGliAltriFile() throws Exception {
        servizio = servizio(DataSize.ofMegabytes(1), DataSize.ofBytes(10_000));
        byte[] zip = FattureProva.zip(FattureProva.voci("a.xml", file("H-2", PESO), "b.xml", file("H-3", PESO)));
        Anteprima a = servizio.anteprima(List.of(new FileCaricato("uno.xml", file("H-1", PESO)), new FileCaricato("due.zip", zip)));
        assertThat(a.fatture()).extracting(f -> f.numero()).containsExactly("H-1");
        assertThat(a.errori()).singleElement().satisfies(e -> {
            assertThat(e.nomeFile()).isEqualTo("due.zip");
            assertThat(e.messaggio()).isEqualTo("I file scelti sono troppo grandi tutti insieme (massimo 10000 byte per volta): «due.zip» non è stato letto. Leggi meno file per volta.");
        });
        // lo stesso zip da solo ci sta (8000 byte estratti)
        assertThat(servizio.anteprima(List.of(new FileCaricato("due.zip", zip))).fatture()).hasSize(2);
    }

    @Test
    void unCaricamentoOltreIlLimiteDiLetturaSiRifiutaPrimaDiLeggerlo() {
        servizio = servizio(DataSize.ofMegabytes(1), DataSize.ofBytes(10_000));
        servizio.controllaCaricamento(10_000);
        assertThatThrownBy(() -> servizio.controllaCaricamento(10_001)).isInstanceOfSatisfying(ErroreApi.class, e -> {
            assertThat(e.getStato()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(e.getMessage()).isEqualTo("I file scelti sono troppo grandi tutti insieme (massimo 10000 byte per volta): scegline meno e riprova.");
        });
    }
}
