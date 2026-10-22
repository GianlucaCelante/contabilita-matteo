package it.contabilita.esporta;

import it.contabilita.api.ErroreApi;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;

/** {@code formato} di {@code GET /api/esporta} (docs/api.md, "Esportazione (fase 3)"). */
public enum FormatoEsportazione {

    XLSX("xlsx", MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")),
    CSV("csv", MediaType.parseMediaType("text/csv;charset=UTF-8"));

    private final String estensione;
    private final MediaType tipoContenuto;

    FormatoEsportazione(String estensione, MediaType tipoContenuto) {
        this.estensione = estensione;
        this.tipoContenuto = tipoContenuto;
    }

    public String estensione() {
        return estensione;
    }

    public MediaType tipoContenuto() {
        return tipoContenuto;
    }

    /** 400 se {@code valore} non e' uno dei formati supportati (anche se mancante). */
    public static FormatoEsportazione diParametro(String valore) {
        for (FormatoEsportazione f : values()) {
            if (f.estensione.equals(valore)) {
                return f;
            }
        }
        throw new ErroreApi(HttpStatus.BAD_REQUEST, "formato: deve essere xlsx o csv");
    }
}
