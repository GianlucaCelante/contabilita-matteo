package it.contabilita.movimenti;

import it.contabilita.api.ErroreApi;
import org.springframework.http.HttpStatus;

/** La voce per cui si raggruppa o si cerca «senza»: fornitore, dipendente o categoria del movimento. */
public enum Voce {
    FORNITORE("fornitore", "Senza fornitore"),
    DIPENDENTE("dipendente", "Senza dipendente"),
    CATEGORIA("categoria", "Senza categoria");

    /** Il nome dell'attributo di {@code Movimento}. */
    public final String attributo;
    /** L'etichetta della riga dei movimenti rimasti senza questa voce. */
    public final String etichettaSenza;

    Voce(String attributo, String etichettaSenza) {
        this.attributo = attributo;
        this.etichettaSenza = etichettaSenza;
    }

    /** Il valore del parametro {@code senza}: assente o vuoto = nessun filtro (null); non valido = 400. */
    public static Voce da(String valore) {
        if (valore == null || valore.isBlank()) {
            return null;
        }
        try {
            return valueOf(valore.trim());
        } catch (IllegalArgumentException e) {
            throw new ErroreApi(HttpStatus.BAD_REQUEST, "senza: valore non valido: " + valore + " (FORNITORE, DIPENDENTE o CATEGORIA).");
        }
    }
}
