package it.contabilita.importa;

import it.contabilita.importa.ImportazioneService.Voce;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** I due calcoli della memoria delle anteprime (s42), senza Spring: il tetto effettivo e chi si scarta. */
class ImportaMemoriaCalcoloTest {

    private static final long MB = 1024 * 1024;

    @Test
    void ilTettoEIlMinimoFraLaProprietaEIlQuarantaPerCentoDellaMemoriaDellaJvm() {
        // l'installer avvia il servizio con -Xmx512m (il 40% e' ~204 MB), e gia' con 256 MB (~102 MB) i 96 MB predefiniti valgono
        assertThat(ImportazioneService.tettoEffettivo(96 * MB, 512 * MB)).isEqualTo(96 * MB);
        assertThat(ImportazioneService.tettoEffettivo(96 * MB, 256 * MB)).isEqualTo(96 * MB);
        // un tetto configurato piu' alto della memoria non puo' valere: si andrebbe in OutOfMemoryError prima di scartare
        assertThat(ImportazioneService.tettoEffettivo(300 * MB, 256 * MB)).isEqualTo(256 * MB * 40 / 100);
        assertThat(ImportazioneService.tettoEffettivo(300 * MB, 4096 * MB)).isEqualTo(300 * MB);
        // valori senza senso: mai negativo; una JVM senza limite (Long.MAX_VALUE) non fa traboccare il conto
        assertThat(ImportazioneService.tettoEffettivo(-5, 256 * MB)).isZero();
        assertThat(ImportazioneService.tettoEffettivo(96 * MB, Long.MAX_VALUE)).isEqualTo(96 * MB);
    }

    // s48: quanto si puo' leggere in una sola anteprima (file caricati, e file estratti dagli zip) segue la memoria.
    @Test
    void ilLimiteDiUnaLetturaEIlMinimoFraLaProprietaEUnQuartoDellaMemoriaDellaJvm() {
        // l'installer avvia il servizio con -Xmx512m: un quarto sono 128 MB giusti (il messaggio al cliente dice «128 MB», non 127)
        assertThat(ImportazioneService.limiteLettura(200 * MB, 512 * MB)).isEqualTo(128 * MB);
        // con i 256 MB di prima sarebbero 64 MB: i 200 MB ammessi finivano la memoria
        assertThat(ImportazioneService.limiteLettura(200 * MB, 256 * MB)).isEqualTo(64 * MB);
        assertThat(ImportazioneService.limiteLettura(Long.MAX_VALUE, 1050)).isEqualTo(262); // 262,5: per difetto, senza perdere i resti
        // con tanta memoria vale la proprieta'
        assertThat(ImportazioneService.limiteLettura(200 * MB, 4096 * MB)).isEqualTo(200 * MB);
        assertThat(ImportazioneService.limiteLettura(10 * MB, 512 * MB)).isEqualTo(10 * MB);
        // valori senza senso: mai negativo; una JVM senza limite (Long.MAX_VALUE) non fa traboccare il conto
        assertThat(ImportazioneService.limiteLettura(-5, 512 * MB)).isZero();
        assertThat(ImportazioneService.limiteLettura(200 * MB, Long.MAX_VALUE)).isEqualTo(200 * MB);
    }

    // Review di s48: quando il limite configurato non vale, il log all'avvio dice perche': la memoria, oppure il massimo fisso.
    @Test
    void lAvvisoAllAvvioDiceLaCausaGiustaDelLimiteDiLettura() {
        assertThat(ImportazioneService.avvisoLimiteLettura(200 * MB, 4096 * MB)).isNull();
        assertThat(ImportazioneService.avvisoLimiteLettura(10 * MB, 512 * MB)).isNull();
        assertThat(ImportazioneService.avvisoLimiteLettura(200 * MB, 512 * MB))
                .isEqualTo("Importazione: in una sola lettura si accettano al massimo 128 MB invece di 200 MB, perché la memoria del programma è 512 MB.");
        // 300 MB configurati con tanta memoria: a limitare sono i 200 MB fissi di LettoreFile, non la memoria
        assertThat(ImportazioneService.avvisoLimiteLettura(300 * MB, 4096 * MB))
                .isEqualTo("Importazione: in una sola lettura si accettano al massimo 200 MB invece di 300 MB, perché 200 MB è il massimo che il programma legge in una volta.");
        // tutti e due piu' bassi del configurato: vale il piu' stretto, e la causa e' la sua
        assertThat(ImportazioneService.avvisoLimiteLettura(300 * MB, 512 * MB)).contains("al massimo 128 MB invece di 300 MB").contains("perché la memoria del programma è 512 MB");
    }

    @Test
    void unaLetturaAlLimiteOccupaMenoMemoriaDelTettoDelleAnteprime() {
        // coerenza con s42: la parte di memoria di una lettura (25%) sta sotto quella di tutte le anteprime insieme (40%)
        for (long memoria : new long[]{128 * MB, 256 * MB, 512 * MB, 1024 * MB}) {
            assertThat(ImportazioneService.limiteLettura(Long.MAX_VALUE, memoria)).as("memoria %d MB", memoria / MB)
                    .isLessThan(ImportazioneService.tettoEffettivo(Long.MAX_VALUE, memoria));
        }
    }

    private static Map<String, Voce> voci(Object... idOrdinePeso) {
        Map<String, Voce> m = new LinkedHashMap<>();
        for (int i = 0; i < idOrdinePeso.length; i += 3) {
            m.put((String) idOrdinePeso[i], new Voce(((Number) idOrdinePeso[i + 1]).longValue(), ((Number) idOrdinePeso[i + 2]).longValue()));
        }
        return m;
    }

    @Test
    void siScartanoLePiuVecchieFinoARientrareNelTetto() {
        assertThat(ImportazioneService.daScartare(voci("a", 1, 40, "b", 2, 40, "c", 3, 40), "c", 20, 100)).containsExactly("a");
        assertThat(ImportazioneService.daScartare(voci("a", 1, 40, "b", 2, 40, "c", 3, 90), "c", 20, 100)).containsExactly("a", "b");
        assertThat(ImportazioneService.daScartare(voci("a", 1, 40, "b", 2, 40), "b", 20, 100)).isEmpty();
        // il tetto sul numero
        assertThat(ImportazioneService.daScartare(voci("a", 1, 0, "b", 2, 0, "c", 3, 0), "c", 2, 100)).containsExactly("a");
    }

    @Test
    void quellaAppenaInseritaNonSiScartaMai() {
        // da sola oltre il tetto: resta
        assertThat(ImportazioneService.daScartare(voci("a", 1, 500), "a", 20, 100)).isEmpty();
        assertThat(ImportazioneService.daScartare(voci("a", 1, 40, "b", 2, 500), "b", 20, 100)).containsExactly("a");
        // nemmeno se non e' quella col numero d'arrivo piu' alto (non deve succedere: l'ordine si assegna sotto lo stesso
        // lock; ma la regola non dipende da questo)
        assertThat(ImportazioneService.daScartare(voci("nuova", 1, 60, "b", 2, 60, "c", 3, 60), "nuova", 20, 100)).containsExactly("b", "c");
        assertThat(ImportazioneService.daScartare(voci("nuova", 1, 0, "b", 2, 0, "c", 3, 0), "nuova", 1, 100)).containsExactly("b", "c");
    }

    // ---- s51: far posto PRIMA di leggere il nuovo carico ----

    @Test
    void primaDiLeggereSiScartanoLePiuVecchieFinoAFarStareIlCaricoDichiarato() {
        // 80 in memoria, ne arrivano 40, tetto 100: basta la piu' vecchia
        assertThat(ImportazioneService.daScartarePrima(voci("a", 1, 40, "b", 2, 40), 40, 100)).containsExactly("a");
        // l'ordine e' quello d'arrivo, non quello della mappa
        assertThat(ImportazioneService.daScartarePrima(voci("b", 2, 40, "a", 1, 40), 40, 100)).containsExactly("a");
        assertThat(ImportazioneService.daScartarePrima(voci("a", 1, 40, "b", 2, 40), 90, 100)).containsExactly("a", "b");
        // giusto al tetto: ci sta, non si tocca niente
        assertThat(ImportazioneService.daScartarePrima(voci("a", 1, 40, "b", 2, 40), 20, 100)).isEmpty();
        assertThat(ImportazioneService.daScartarePrima(voci("a", 1, 40, "b", 2, 40), 21, 100)).containsExactly("a");
        // un carico che da solo supera il tetto: escono tutte (come dopo la lettura: resterebbe da sola)
        assertThat(ImportazioneService.daScartarePrima(voci("a", 1, 40, "b", 2, 40), 500, 100)).containsExactly("a", "b");
        assertThat(ImportazioneService.daScartarePrima(voci("a", 1, 40), Long.MAX_VALUE, 100)).containsExactly("a");
    }

    @Test
    void primaDiLeggereNonSiScartaNienteSenzaMotivo() {
        // niente che possa entrare in memoria (carico rifiutato in partenza): le anteprime restano, anche se sono gia' oltre il tetto
        assertThat(ImportazioneService.daScartarePrima(voci("a", 1, 500), 0, 100)).isEmpty();
        assertThat(ImportazioneService.daScartarePrima(voci("a", 1, 500), -7, 100)).isEmpty();
        // niente in memoria: niente da scartare
        assertThat(ImportazioneService.daScartarePrima(voci(), 500, 100)).isEmpty();
        // il tetto sul numero NON vale prima della lettura: tante anteprime leggere le decide solo l'inserimento
        assertThat(ImportazioneService.daScartarePrima(voci("a", 1, 1, "b", 2, 1, "c", 3, 1), 1, 100)).isEmpty();
    }

    @Test
    void quelloCheSiScartaPrimaSarebbeUscitoComunqueDopoUnaLetturaRiuscita() {
        // stessa regola, stesso tetto: se la lettura riesce e pesa quanto dichiarato, far posto prima o dopo toglie le stesse
        Map<String, Voce> prima = voci("a", 1, 40, "b", 2, 30, "c", 3, 20);
        for (long carico : new long[]{1, 10, 11, 30, 31, 60, 61, 100, 101, 400}) {
            Map<String, Voce> dopo = new LinkedHashMap<>(prima);
            dopo.put("nuova", new Voce(4, carico));
            assertThat(ImportazioneService.daScartarePrima(prima, carico, 100)).as("carico %d", carico)
                    .isEqualTo(ImportazioneService.daScartare(dopo, "nuova", 20, 100));
        }
    }

    // ---- s52: il limite per file segue la memoria (un XML aperto occupa molte volte i suoi byte) ----

    @Test
    void ilLimitePerFileEIlMinimoFraVentiMegabyteEUnQuartoDellaMemoriaDivisoPerIlFattoreDelDom() {
        assertThat(ImportazioneService.FATTORE_DOM).isEqualTo(8);
        // con i 512 MB dell'installer: 128 MB / 8 = 16 MB; con 256 MB la meta'
        assertThat(ImportazioneService.limiteFile(512 * MB)).isEqualTo(16 * MB);
        assertThat(ImportazioneService.limiteFile(256 * MB)).isEqualTo(8 * MB);
        // i 20 MB di LettoreFile valgono solo da 640 MB di memoria in su
        assertThat(ImportazioneService.limiteFile(640 * MB)).isEqualTo(20 * MB);
        assertThat(ImportazioneService.limiteFile(639 * MB)).isEqualTo(19 * MB); // 19,97: MB interi, per difetto (il messaggio dice «19 MB»)
        assertThat(ImportazioneService.limiteFile(4096 * MB)).isEqualTo(LettoreFile.MAX_BYTE_FILE);
        assertThat(ImportazioneService.limiteFile(Long.MAX_VALUE)).isEqualTo(LettoreFile.MAX_BYTE_FILE);
        // sotto il megabyte resta in byte; mai negativo
        assertThat(ImportazioneService.limiteFile(6400)).isEqualTo(200);
        assertThat(ImportazioneService.limiteFile(0)).isZero();
        assertThat(ImportazioneService.limiteFile(-5)).isZero();
    }

    @Test
    void unFileAlLimiteApertoStaNellaParteDiMemoriaDiUnaLettura() {
        for (long memoria : new long[]{128 * MB, 256 * MB, 512 * MB, 1024 * MB, 4096 * MB}) {
            assertThat(ImportazioneService.limiteFile(memoria) * ImportazioneService.FATTORE_DOM).as("memoria %d MB", memoria / MB)
                    .isLessThanOrEqualTo(memoria / 4);
        }
    }

    @Test
    void lAvvisoAllAvvioDiceIlLimitePerFileQuandoLoAbbassaLaMemoria() {
        assertThat(ImportazioneService.avvisoLimiteFile(4096 * MB)).isNull();
        assertThat(ImportazioneService.avvisoLimiteFile(512 * MB))
                .isEqualTo("Importazione: un file si legge se pesa al massimo 16 MB invece di 20 MB, perché la memoria del programma è 512 MB.");
    }
}
