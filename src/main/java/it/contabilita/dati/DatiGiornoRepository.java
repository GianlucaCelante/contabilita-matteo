package it.contabilita.dati;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface DatiGiornoRepository extends JpaRepository<DatiGiorno, Long> {
    Optional<DatiGiorno> findBySedeIdAndGiorno(Long sedeId, LocalDate giorno);

    List<DatiGiorno> findBySedeIdAndGiornoBetween(Long sedeId, LocalDate da, LocalDate a);

    /** I dati dei giorni da {@code da} a {@code a}, estremi compresi. */
    @EntityGraph(attributePaths = {"sede"})
    List<DatiGiorno> findByGiornoBetweenOrderByGiornoAscIdAsc(LocalDate da, LocalDate a);
}
