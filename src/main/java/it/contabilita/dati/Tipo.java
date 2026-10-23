package it.contabilita.dati;

import java.util.List;

/** Natura di un movimento; ogni tipo ammette solo certi documenti (docs/api.md). */
public enum Tipo {
    RICAVO(Documento.RICAVO_FATTURATO, Documento.RICAVO_EXTRA),
    COSTO_VARIABILE(Documento.FATTURA, Documento.NOTA_DI_CREDITO, Documento.SCONTRINO),
    COSTO_FISSO(Documento.RETRIBUZIONE_REGOLARE, Documento.RETRIBUZIONE_EXTRA, Documento.NESSUNO);

    private final List<Documento> documentiValidi;

    Tipo(Documento... documenti) {
        this.documentiValidi = List.of(documenti);
    }

    public boolean ammette(Documento documento) {
        return documentiValidi.contains(documento);
    }

    public boolean isCosto() {
        return this != RICAVO;
    }
}
