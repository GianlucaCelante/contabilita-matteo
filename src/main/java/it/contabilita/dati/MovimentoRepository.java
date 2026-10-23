package it.contabilita.dati;

import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface MovimentoRepository extends JpaRepository<Movimento, Long>, JpaSpecificationExecutor<Movimento> {

    @Override
    @EntityGraph(attributePaths = {"categoria", "fornitore", "dipendente", "ricorrenza"})
    List<Movimento> findAll(Specification<Movimento> spec, Sort sort);

    @EntityGraph(attributePaths = {"categoria", "fornitore", "dipendente", "ricorrenza"})
    Optional<Movimento> findWithRelazioniById(Long id);

    /** Le fatture gia' registrate con quel numero e quella data (il fornitore si confronta nel servizio). */
    @EntityGraph(attributePaths = {"fornitore"})
    List<Movimento> findByDocumentoAndNumeroDocumentoAndData(Documento documento, String numeroDocumento, LocalDate data);

    /** L'ultimo movimento con categoria di quel fornitore e tipo (per suggerire la categoria). */
    @EntityGraph(attributePaths = {"categoria"})
    Optional<Movimento> findFirstByFornitoreIdAndTipoAndCategoriaIsNotNullOrderByIdDesc(Long fornitoreId, Tipo tipo);

    boolean existsByRicorrenzaIdAndData(Long ricorrenzaId, LocalDate data);
}
