package it.contabilita.importa;

import java.time.LocalDate;
import java.util.List;

/** Oggetti JSON dell'importazione (docs/api.md, "Importazione di fatture elettroniche"). Importi in centesimi. */
public final class ImportaDto {

    private ImportaDto() {
    }

    public record FornitoreLetto(String nome, String partitaIva) {
    }

    public record FatturaLetta(int indice, String nomeFile, FornitoreLetto fornitore, String numero, LocalDate data,
                               long imponibileCent, long ivaCent, long totaleCent,
                               String categoriaSuggerita, boolean duplicata, String motivo, boolean notaDiCredito) {
    }

    public record ErroreImportazione(String nomeFile, String messaggio) {
    }

    public record Anteprima(String importazioneId, List<FatturaLetta> fatture, List<ErroreImportazione> errori) {
    }

    public record RigaConferma(Integer indice, String categoria) {
    }

    public record Conferma(String importazioneId, List<RigaConferma> righe) {
    }

    public record RigaIgnorata(int indice, String motivo) {
    }

    public record EsitoConferma(int importati, List<RigaIgnorata> ignorate) {
    }

    /** Un file caricato, prima della lettura. */
    public record FileCaricato(String nome, byte[] contenuto) {
    }
}
