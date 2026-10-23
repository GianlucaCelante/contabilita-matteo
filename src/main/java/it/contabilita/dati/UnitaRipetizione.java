package it.contabilita.dati;

/** Ogni quanto si ripete un movimento: «ogni N» giorni, settimane, mesi o anni. */
public enum UnitaRipetizione {
    GIORNI(365, "giorni"),
    SETTIMANE(104, "settimane"),
    MESI(60, "mesi"),
    ANNI(10, "anni");

    private final int massimo;
    private final String nome;

    UnitaRipetizione(int massimo, String nome) {
        this.massimo = massimo;
        this.nome = nome;
    }

    /** Il valore piu' alto di «ogni N». */
    public int massimo() {
        return massimo;
    }

    public String nome() {
        return nome;
    }

    /** Mesi e anni cadono sempre nello stesso giorno del mese (accorciato nei mesi piu' corti). */
    public boolean usaIlGiornoDelMese() {
        return this == MESI || this == ANNI;
    }
}
