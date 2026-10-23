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

    /** Quanti movimenti ha ogni fornitore: {@code [id del fornitore, numero]} (per ordinare i suggerimenti). */
    @org.springframework.data.jpa.repository.Query("select m.fornitore.id, count(m) from Movimento m where m.fornitore is not null group by m.fornitore.id")
    List<Object[]> contaPerFornitore();

    boolean existsByRicorrenzaIdAndData(Long ricorrenzaId, LocalDate data);
}
