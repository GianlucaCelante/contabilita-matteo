package it.contabilita.api;

import it.contabilita.dati.Documento;
import it.contabilita.dati.Origine;
import it.contabilita.dati.Tipo;
import it.contabilita.dati.UnitaRipetizione;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** Oggetti JSON del contratto (docs/api.md). Importi in centesimi, date ISO. */
public final class Dto {

    private Dto() {
    }

    public record CategoriaDto(Long id, String nome, Tipo tipo) {
    }

    public record FornitoreDto(Long id, String nome, String partitaIva) {
    }

    public record DipendenteDto(Long id, String nome) {
    }

    public record NomeInput(String nome, Tipo tipo, String partitaIva) {
    }

    public record Rif(Long id, String nome) {
    }

    public record RicorrenzaRif(Long id, int giorno, boolean attiva, UnitaRipetizione unita, int intervallo) {
    }

    /** Senza unita e intervallo vale «ogni mese»; il giorno serve per mesi e anni. */
    public record RicorrenzaInput(Integer giorno, UnitaRipetizione unita, Integer intervallo) {
    }

    public record MovimentoInput(LocalDate data, Tipo tipo, Documento documento, Long importoCent,
                                 String categoria, String fornitore, String dipendente,
                                 String descrizione, String numeroDocumento, String note,
                                 RicorrenzaInput ricorrenza) {
    }

    public record MovimentoDto(Long id, LocalDate data, Tipo tipo, Documento documento, long importoCent,
                               Rif categoria, Rif fornitore, Rif dipendente,
                               String descrizione, String numeroDocumento, String note,
                               Origine origine, RicorrenzaRif ricorrenza, String allegatoNome,
                               LocalDateTime creatoIl, LocalDateTime modificatoIl) {
    }

    public record Totali(long ricaviCent, long costiCent, long saldoCent) {
    }

    public record ElencoMovimenti(List<MovimentoDto> elementi, Totali totali) {
    }

    public record Ricavi(long fatturatiCent, long extraCent, long totaleCent) {
    }

    public record CostiVariabili(long fattureCent, long scontriniCent, long totaleCent) {
    }

    public record VoceFissa(String categoria, long importoCent) {
    }

    public record CostiFissi(long retribuzioneRegolareCent, long retribuzioneExtraCent,
                             List<VoceFissa> altreVoci, long totaleCent) {
    }

    public record Riepilogo(LocalDate da, LocalDate a, Ricavi ricavi, CostiVariabili costiVariabili,
                            CostiFissi costiFissi, long costiCent, long risultatoCent) {
    }
}
