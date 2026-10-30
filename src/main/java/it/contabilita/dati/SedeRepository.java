package it.contabilita.dati;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface SedeRepository extends JpaRepository<Sede, Long> {
    Optional<Sede> findByNomeChiave(String nomeChiave);

    /** Le non archiviate per prime, poi per ordine e id. */
    List<Sede> findAllByOrderByArchiviataAscOrdineAscIdAsc();

    List<Sede> findByArchiviataFalseOrderByOrdineAscIdAsc();

    long countByArchiviataFalse();

    @Query("select coalesce(max(s.ordine), 0) from Sede s")
    int ordineMassimo();
}
