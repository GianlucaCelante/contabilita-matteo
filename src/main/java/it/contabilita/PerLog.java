package it.contabilita;

/**
 * I valori che arrivano dal cliente (nomi di file, voci di uno zip, campi letti da una fattura, messaggi che li riportano)
 * prima di finire nel log: senza a capo e senza caratteri di controllo, cosi' un nome di file non puo' scrivere una riga di
 * log finta ne' sporcare il terminale di chi la legge.
 */
public final class PerLog {

    /** Oltre questa lunghezza il valore si tronca (con «…»): un nome lunghissimo non riempie il log. */
    public static final int LUNGHEZZA_MASSIMA = 300;

    /**
     * Il limite per il testo di un'eccezione ({@link #conStack}): piu' alto, perche' i messaggi di Hibernate e di SQL sono
     * lunghi e la parte utile sta spesso in fondo. I caratteri si sostituiscono comunque.
     */
    public static final int LUNGHEZZA_MASSIMA_ECCEZIONE = 4000;

    private PerLog() {
    }

    public static String pulisci(Object valore) {
        return pulisci(valore, LUNGHEZZA_MASSIMA);
    }

    private static String pulisci(Object valore, int lunghezzaMassima) {
        String testo = String.valueOf(valore);
        StringBuilder pulito = new StringBuilder(Math.min(testo.length(), lunghezzaMassima) + 1);
        int scritti = 0;
        for (int i = 0; i < testo.length(); ) {
            if (scritti == lunghezzaMassima) {
                return pulito.append('…').toString();
            }
            int c = testo.codePointAt(i);
            i += Character.charCount(c);
            pulito.appendCodePoint(daSostituire(c) ? '_' : c);
            scritti++;
        }
        return pulito.toString();
    }

    /**
     * L'eccezione da passare al log quando serve lo stack ({@code log.error("...", PerLog.conStack(e))}): stesso stack e
     * stesse cause, ma il testo di ognuna ({@code tipo: messaggio}) passa da {@link #pulisci} (con il limite piu' alto,
     * {@link #LUNGHEZZA_MASSIMA_ECCEZIONE}). Il messaggio di un'eccezione
     * riporta spesso un valore del cliente (un percorso, un nome di file, un'intestazione della richiesta), e il log lo
     * scrive com'e' in testa allo stack: senza questo, un a capo li' dentro farebbe una riga di log finta.
     *
     * <p>Nel log compare come l'originale, {@code <tipo vero>: <messaggio pulito>} (logback scrive il {@code toString()}).
     */
    public static Throwable conStack(Throwable e) {
        return e == null ? null : new Eccezione(e, new java.util.IdentityHashMap<>());
    }

    /** Copia di un'eccezione per il log: vedi {@link #conStack}. Senza stack suo: porta quello dell'originale. */
    public static final class Eccezione extends Throwable {

        private Eccezione(Throwable originale, java.util.Map<Throwable, Boolean> viste) {
            super(pulisci(originale.toString(), LUNGHEZZA_MASSIMA_ECCEZIONE), causaPulita(originale, viste), true, true);
            setStackTrace(originale.getStackTrace());
            for (Throwable soppressa : originale.getSuppressed()) {
                if (!viste.containsKey(soppressa)) {
                    addSuppressed(new Eccezione(soppressa, viste));
                }
            }
        }

        private static Eccezione causaPulita(Throwable originale, java.util.Map<Throwable, Boolean> viste) {
            viste.put(originale, Boolean.TRUE);
            Throwable causa = originale.getCause();
            // una catena di cause che torna su se stessa si ferma
            return causa == null || viste.containsKey(causa) ? null : new Eccezione(causa, viste);
        }

        @Override
        public synchronized Throwable fillInStackTrace() {
            return this; // lo stack e' quello dell'originale
        }

        @Override
        public String toString() {
            return getMessage();
        }
    }

    /**
     * Caratteri di controllo (a capo, tabulazione, ESC, NEL…), separatori di riga e di paragrafo Unicode, mezzi surrogati
     * e i caratteri che cambiano la direzione del testo (con cui una riga si puo' far leggere al contrario).
     */
    private static boolean daSostituire(int c) {
        int tipo = Character.getType(c);
        return tipo == Character.CONTROL || tipo == Character.LINE_SEPARATOR || tipo == Character.PARAGRAPH_SEPARATOR
                || tipo == Character.SURROGATE
                || c == 0x061C || c == 0x200E || c == 0x200F || (c >= 0x202A && c <= 0x202E) || (c >= 0x2066 && c <= 0x2069);
    }
}
