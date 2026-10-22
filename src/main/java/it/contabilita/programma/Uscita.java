package it.contabilita.programma;

/**
 * Chiusura del programma richiesta dal codice (dopo un ripristino da copia). Un'interfaccia a parte
 * perche' i test la sostituiscono: nei test non si chiama mai {@code System.exit}.
 */
public interface Uscita {

    /**
     * Codice di uscita del ripristino: diverso da zero, cosi' WinSW ({@code onfailure restart}) e
     * launchd ({@code KeepAlive}) riavviano il servizio.
     */
    int CODICE_RIAVVIO = 75;

    /**
     * Chiede la chiusura del programma con il codice dato. Torna subito: la chiusura vera avviene
     * dopo, a risposta HTTP gia' inviata.
     */
    void esci(int codice);
}
