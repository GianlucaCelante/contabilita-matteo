package it.contabilita.programma;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** L'uscita vera: dopo una breve attesa (la risposta HTTP parte prima) chiude la JVM con {@link System#exit}. */
@Component
public class UscitaJvm implements Uscita {

    private static final Logger log = LoggerFactory.getLogger(UscitaJvm.class);
    private static final long ATTESA_MS = 1_500L;

    @Override
    public void esci(int codice) {
        Thread t = new Thread(() -> {
            try {
                Thread.sleep(ATTESA_MS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            log.info("Chiusura del programma con codice {}.", codice);
            System.exit(codice);
        }, "uscita-programma");
        t.setDaemon(false);
        t.start();
    }
}
