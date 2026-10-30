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

    public record CategoriaDto(Long id, String nome, Tipo tipo, boolean personalizzata) {
    }

    public record FornitoreDto(Long id, String nome, String partitaIva) {
    }

    public record DipendenteDto(Long id, String nome) {
    }

    public record NomeInput(String nome, Tipo tipo, String partitaIva) {
    }

    public record Rif(Long id, String nome) {
    }

    /** {@code prossimaData}: la prossima scadenza ancora da registrare. */
    public record RicorrenzaRif(Long id, int giorno, boolean attiva, UnitaRipetizione unita, int intervallo, LocalDate prossimaData) {
    }

    /** Senza unita e intervallo vale «ogni mese»; il giorno serve per mesi e anni. */
    public record RicorrenzaInput(Integer giorno, UnitaRipetizione unita, Integer intervallo) {
    }

    public record MovimentoInput(LocalDate data, Tipo tipo, Documento documento, Long importoCent,
                                 String categoria, String fornitore, String dipendente,
                                 String descrizione, String numeroDocumento, String note,
                                 RicorrenzaInput ricorrenza, Long sedeId) {
    }

    public record MovimentoDto(Long id, LocalDate data, Tipo tipo, Documento documento, long importoCent,
                               Rif categoria, Rif fornitore, Rif dipendente, Rif sede,
                               String descrizione, String numeroDocumento, String note,
                               Origine origine, RicorrenzaRif ricorrenza, String allegatoNome,
                               LocalDateTime creatoIl, LocalDateTime modificatoIl) {
    }

    public record Totali(long ricaviCent, long costiCent, long saldoCent) {
    }

    public record ElencoMovimenti(List<MovimentoDto> elementi, Totali totali) {
    }

    /** {@code altreVoci}: i ricavi di categoria personalizzata, una riga per categoria. */
    public record Ricavi(long fatturatiCent, long extraCent, List<VoceFissa> altreVoci, long totaleCent) {
    }

    /** {@code altreVoci}: i costi variabili di categoria personalizzata, una riga per categoria. */
    public record CostiVariabili(long fattureCent, long scontriniCent, List<VoceFissa> altreVoci, long totaleCent) {
    }

    public record VoceFissa(String categoria, long importoCent) {
    }

    public record CostiFissi(long retribuzioneRegolareCent, long retribuzioneExtraCent,
                             List<VoceFissa> altreVoci, long totaleCent) {
    }

    public record Riepilogo(LocalDate da, LocalDate a, Ricavi ricavi, CostiVariabili costiVariabili,
                            CostiFissi costiFissi, long costiCent, long risultatoCent, List<RisultatoSede> perSede) {
    }

    /** Ricavi, costi e risultato di una sede nel periodo del riepilogo. */
    public record RisultatoSede(Rif sede, long ricaviCent, long costiCent, long risultatoCent) {
    }

    /** {@code movimenti}: quanti movimenti ha la sede (anche in anni passati). */
    public record SedeDto(Long id, String nome, boolean archiviata, int ordine, long movimenti) {
    }

    /** Tutti i campi sono facoltativi: nella creazione serve il nome, nella modifica si manda quello che cambia. */
    public record SedeInput(String nome, Boolean archiviata) {
    }

    // ---- statistiche settimanali (docs/api.md, "Statistiche") ----

    /** Una voce del corpo di {@code PUT /api/statistiche/settimana}: numeri interi; entrambi assenti = cancella il dato. */
    public record VoceSettimanaInput(Long sedeId, java.math.BigDecimal pizze, java.math.BigDecimal ordini) {
    }

    public record SettimanaInput(String settimana, List<VoceSettimanaInput> voci) {
    }

    /** {@code pizze}, {@code ordini}, {@code scontrinoMedioCent} e {@code pizzePerOrdine} sono null se il dato non c'e' (o ordini = 0). */
    public record StatisticaSede(Rif sede, Integer pizze, Integer ordini, long ricaviCent, Long scontrinoMedioCent,
                                 Double pizzePerOrdine, boolean completa) {
    }

    public record SettimanaDto(LocalDate settimana, LocalDate fine, List<StatisticaSede> sedi) {
    }

    public record TotaleStatistiche(long pizze, long ordini, long ricaviCent, Long scontrinoMedioCent,
                                    Double pizzePerOrdine, int settimaneConDati, int settimaneTotali) {
    }

    public record StatisticaPerSede(Rif sede, long pizze, long ordini, long ricaviCent, Long scontrinoMedioCent,
                                    Double pizzePerOrdine, int settimaneConDati) {
    }

    public record StatisticaSettimana(LocalDate settimana, long pizze, long ordini, long ricaviCent,
                                      Long scontrinoMedioCent, List<Rif> sediMancanti) {
    }

    public record Statistiche(LocalDate da, LocalDate a, TotaleStatistiche totale, List<StatisticaPerSede> perSede,
                              List<StatisticaSettimana> settimane) {
    }
}
