package it.contabilita.dati;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface DatiSettimanaRepository extends JpaRepository<DatiSettimana, Long> {
    Optional<DatiSettimana> findBySedeIdAndSettimana(Long sedeId, LocalDate settimana);

    /** I dati delle settimane (lunedi') da {@code da} a {@code a}, estremi compresi. */
    @EntityGraph(attributePaths = {"sede"})
    List<DatiSettimana> findBySettimanaBetweenOrderBySettimanaAscIdAsc(LocalDate da, LocalDate a);
}
