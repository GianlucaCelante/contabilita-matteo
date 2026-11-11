package it.contabilita.importa;

import java.time.LocalDate;
import java.util.List;

/** Oggetti JSON dell'importazione (docs/api.md, "Importazione di fatture elettroniche"). Importi in centesimi. */
public final class ImportaDto {

    private ImportaDto() {
    }

    public record FornitoreLetto(String nome, String partitaIva) {
    }

    /**
     * {@code tipoDocumento}: il codice del tracciato ({@code TD01}, {@code TD05}…), per chi vuole distinguere; al cliente non
     * si mostra. {@code notaDiDebito}: {@code TD05}/{@code TD09}, che si importano come fatture (un costo in piu').
     */
    public record FatturaLetta(int indice, String nomeFile, FornitoreLetto fornitore, String numero, LocalDate data,
                               long imponibileCent, long ivaCent, long totaleCent,
                               String categoriaSuggerita, boolean duplicata, String motivo, boolean notaDiCredito,
                               boolean integrazione, String tipoDocumento, boolean notaDiDebito) {
    }

    public record ErroreImportazione(String nomeFile, String messaggio) {
    }

    public record Anteprima(String importazioneId, List<FatturaLetta> fatture, List<ErroreImportazione> errori) {
    }

    public record RigaConferma(Integer indice, String categoria) {
    }

    public record Conferma(String importazioneId, List<RigaConferma> righe, Long sedeId) {
    }

    public record RigaIgnorata(int indice, String motivo) {
    }

    public record EsitoConferma(int importati, List<RigaIgnorata> ignorate) {
    }

    /** Un file caricato, prima della lettura. */
    public record FileCaricato(String nome, byte[] contenuto) {
    }
}
