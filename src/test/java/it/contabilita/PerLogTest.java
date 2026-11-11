package it.contabilita;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** I valori del cliente scritti nel log non possono andare a capo ne' portare caratteri di controllo. */
class PerLogTest {

    @Test
    void aCapoECaratteriDiControlloDiventanoUnTrattinoBasso() {
        assertThat(PerLog.pulisci("a.xml\r\n2026-01-01 INFO finta riga")).isEqualTo("a.xml__2026-01-01 INFO finta riga");
        assertThat(PerLog.pulisci("a\tb\u0000c\u001bd\u007fe\u0085f")).isEqualTo("a_b_c_d_e_f");
    }

    @Test
    void ancheISeparatoriDiRigaUnicodeEICambiDiDirezione() {
        assertThat(PerLog.pulisci("a b c")).isEqualTo("a_b_c");
        assertThat(PerLog.pulisci("a‮b⁦c‏d")).isEqualTo("a_b_c_d");
    }

    @Test
    void ilTestoNormaleRestaComE() {
        assertThat(PerLog.pulisci("fatture.zip › sotto/Caffè «Però» 1.xml")).isEqualTo("fatture.zip › sotto/Caffè «Però» 1.xml");
        assertThat(PerLog.pulisci("😀 ok")).isEqualTo("😀 ok");
        assertThat(PerLog.pulisci(42)).isEqualTo("42");
        assertThat(PerLog.pulisci(null)).isEqualTo("null");
    }

    @Test
    void unValoreLunghissimoSiTronca() {
        String pulito = PerLog.pulisci("x".repeat(5000));
        assertThat(pulito).hasSize(PerLog.LUNGHEZZA_MASSIMA + 1).endsWith("…");
    }

    // s43/s44: quando al log serve lo stack, l'eccezione passa da conStack: stesso stack, messaggi puliti (anche le cause).
    @Test
    void conStackTieneLoStackEPulisceIMessaggiDiEccezioneECause() {
        Exception causa = new java.io.IOException("percorso D:\\Copie\r\nFINTA RIGA");
        Exception originale = new IllegalStateException("fallita\ncopia\u2028x", causa);
        originale.addSuppressed(new RuntimeException("soppressa\tcon tab"));

        Throwable pulita = PerLog.conStack(originale);

        assertThat(pulita.getMessage()).isEqualTo("java.lang.IllegalStateException: fallita_copia_x");
        assertThat(pulita.toString()).isEqualTo("java.lang.IllegalStateException: fallita_copia_x");
        assertThat(pulita.getStackTrace()).isEqualTo(originale.getStackTrace());
        assertThat(pulita.getCause().getMessage()).isEqualTo("java.io.IOException: percorso D:\\Copie__FINTA RIGA");
        assertThat(pulita.getCause().getStackTrace()).isEqualTo(causa.getStackTrace());
        assertThat(pulita.getSuppressed()).singleElement()
                .satisfies(s -> assertThat(s.getMessage()).isEqualTo("java.lang.RuntimeException: soppressa_con tab"));
        java.io.StringWriter scritto = new java.io.StringWriter();
        pulita.printStackTrace(new java.io.PrintWriter(scritto));
        assertThat(scritto.toString()).doesNotContain("\nFINTA RIGA").doesNotContain("\u2028").contains("Caused by: java.io.IOException: percorso");
        assertThat(PerLog.conStack(null)).isNull();
    }

    // Il messaggio di un'eccezione (Hibernate, SQL) e' lungo e la parte utile sta spesso in fondo: per le eccezioni il
    // limite e' alto, ma i caratteri si sostituiscono comunque.
    @Test
    void conStackNonTroncaAiTrecentoCaratteriIMessaggiDelleEccezioni() {
        String lungo = "could not execute statement [" + "x".repeat(1500) + "]\r\n[SQLITE_CONSTRAINT] la parte utile in fondo";
        Throwable pulita = PerLog.conStack(new IllegalStateException("fuori", new RuntimeException(lungo)));
        assertThat(pulita.getCause().getMessage()).endsWith("]__[SQLITE_CONSTRAINT] la parte utile in fondo").doesNotContain("…");
        // un limite c'e' comunque
        Throwable enorme = PerLog.conStack(new RuntimeException("y".repeat(20_000)));
        assertThat(enorme.getMessage()).hasSize(PerLog.LUNGHEZZA_MASSIMA_ECCEZIONE + 1).endsWith("…");
        // i valori normali restano a 300
        assertThat(PerLog.pulisci("x".repeat(5000))).hasSize(PerLog.LUNGHEZZA_MASSIMA + 1);
    }

    @Test
    void conStackNonSiPerdeInUnaCatenaDiCauseCheTornaSuSeStessa() {
        Exception a = new RuntimeException("a");
        Exception b = new RuntimeException("b");
        b.initCause(a);
        a.initCause(b);
        Throwable pulita = PerLog.conStack(a);
        assertThat(pulita.getCause().getMessage()).isEqualTo("java.lang.RuntimeException: b");
        assertThat(pulita.getCause().getCause()).isNull();
    }
}
