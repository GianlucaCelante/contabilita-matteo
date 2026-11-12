package it.contabilita;

/**
 * Il nome del programma, come lo legge chi lo usa: «Fuorigioco» (sa di calcio, come la schermata della password).
 * Vale solo per i testi mostrati (il nome dei file esportati, le proprieta' del file Excel). I nomi tecnici
 * NON seguono e non vanno cambiati: il package {@code it.contabilita}, le proprieta' {@code contabilita.*},
 * {@code CONTABILITA_DATA_DIR}, {@code contabilita.db}, il servizio Windows {@code Contabilita}.
 * Lo stesso nome sta, per l'interfaccia, in {@code ui/src/util/nomeProgramma.ts}.
 */
public final class NomeProgramma {

    /** Il nome a schermo. */
    public static final String NOME = "Fuorigioco";

    /** L'inizio del nome dei file esportati: senza maiuscole ne' accenti. */
    public static final String PREFISSO_FILE = "fuorigioco";

    private NomeProgramma() {
    }
}
