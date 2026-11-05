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

    /** {@code usi}: quanti movimenti usano la voce. */
    public record CategoriaDto(Long id, String nome, Tipo tipo, boolean retribuzione, long usi) {
    }

    public record FornitoreDto(Long id, String nome, String partitaIva, long usi) {
    }

    public record DipendenteDto(Long id, String nome, long usi) {
    }

    public record NomeInput(String nome, Tipo tipo, String partitaIva, Boolean retribuzione) {
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
                                 RicorrenzaInput ricorrenza, Long sedeId, Boolean pagata) {
    }

    public record MovimentoDto(Long id, LocalDate data, Tipo tipo, Documento documento, long importoCent,
                               Rif categoria, Rif fornitore, Rif dipendente, Rif sede,
                               String descrizione, String numeroDocumento, String note,
                               Origine origine, boolean pagata, RicorrenzaRif ricorrenza, String allegatoNome,
                               LocalDateTime creatoIl, LocalDateTime modificatoIl) {
    }

    /** Corpo di {@code PUT /api/movimenti/{id}/pagata}. */
    public record PagataInput(Boolean pagata) {
    }

    public record Totali(long ricaviCent, long costiCent, long saldoCent) {
    }

    public record ElencoMovimenti(List<MovimentoDto> elementi, Totali totali) {
    }

    /** Una riga per categoria; {@code id} e' null per «Senza categoria». */
    public record VoceCategoria(Long id, String categoria, long importoCent) {
    }

    /** {@code fatturatiCent} e {@code extraCent} sono "di cui": non si sommano al totale. */
    public record Ricavi(List<VoceCategoria> voci, long fatturatiCent, long extraCent, long totaleCent) {
    }

    /** {@code fattureCent} (fatture - note di credito) e {@code scontriniCent} sono "di cui". */
    public record CostiVariabili(List<VoceCategoria> voci, long fattureCent, long scontriniCent, long totaleCent) {
    }

    /** Le due retribuzioni sono "di cui". */
    public record CostiFissi(List<VoceCategoria> voci, long retribuzioneRegolareCent, long retribuzioneExtraCent,
                             long totaleCent) {
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
