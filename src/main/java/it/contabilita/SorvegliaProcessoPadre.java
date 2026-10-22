package it.contabilita;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Optional;

/**
 * Se il processo padre (il servizio WinSW, {@code Contabilita.exe}) sparisce, questa JVM si chiude
 * da sola: una JVM sopravvissuta alla morte del suo servizio resterebbe in ascolto sulla porta
 * 8766 e il servizio, ripartendo, non riuscirebbe piu' a occuparla.
 *
 * <p>Parte dalla prima riga di {@code main()}, non a Spring pronto: un padre gia' sparito vuol
 * dire JVM gia' orfana, e si chiude subito.
 *
 * <p>Attiva solo con {@code -Dcontabilita.sorveglia-padre=true} (lo passa {@code Contabilita.xml}
 * del servizio): lanciata a mano da un terminale o dall'IDE l'app non deve chiudersi quando
 * chi l'ha avviata se ne va.
 */
final class SorvegliaProcessoPadre {

    private static final Logger log = LoggerFactory.getLogger(SorvegliaProcessoPadre.class);
    private static final String PROPRIETA = "contabilita.sorveglia-padre";
    private static final long INTERVALLO_MS = 5_000L;

    private SorvegliaProcessoPadre() {
    }

    static void avviaSeRichiesta() {
        if (!Boolean.getBoolean(PROPRIETA)) {
            return;
        }
        Optional<ProcessHandle> padre = ProcessHandle.current().parent();
        if (padre.isEmpty()) {
            log.warn("Il processo padre (il servizio) non c'e' gia' piu' all'avvio: chiudo questa JVM per non restare orfana sulla porta.");
            System.exit(0);
        }
        ProcessHandle handle = padre.get();
        log.info("Sorveglio il processo padre {} ({}): se sparisce, questa JVM si chiude.",
                handle.pid(), handle.info().command().orElse("?"));
        Thread t = new Thread(() -> sorveglia(handle), "sorveglia-padre");
        t.setDaemon(true);
        t.start();
    }

    private static void sorveglia(ProcessHandle padre) {
        while (true) {
            try {
                Thread.sleep(INTERVALLO_MS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
            // ProcessHandle segue QUEL processo (pid + istante di avvio): un altro processo che
            // riusa lo stesso pid non conta come padre vivo.
            if (!padre.isAlive()) {
                log.warn("Il processo padre {} non c'e' piu': chiudo questa JVM per non restare orfana sulla porta.", padre.pid());
                System.exit(0);
            }
        }
    }
}
