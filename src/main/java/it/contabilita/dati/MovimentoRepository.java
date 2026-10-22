package it.contabilita.dati;

import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface MovimentoRepository extends JpaRepository<Movimento, Long>, JpaSpecificationExecutor<Movimento> {

    @Override
    @EntityGraph(attributePaths = {"categoria", "fornitore", "dipendente", "ricorrenza"})
    List<Movimento> findAll(Specification<Movimento> spec, Sort sort);

    @EntityGraph(attributePaths = {"categoria", "fornitore", "dipendente", "ricorrenza"})
    Optional<Movimento> findWithRelazioniById(Long id);

    boolean existsByRicorrenzaIdAndAnnoMese(Long ricorrenzaId, String annoMese);
}
