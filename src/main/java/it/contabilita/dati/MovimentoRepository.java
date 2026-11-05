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
    @EntityGraph(attributePaths = {"categoria", "fornitore", "dipendente", "ricorrenza", "sede"})
    List<Movimento> findAll(Specification<Movimento> spec, Sort sort);

    @EntityGraph(attributePaths = {"categoria", "fornitore", "dipendente", "ricorrenza", "sede"})
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

    /** Quanti movimenti ha ogni sede: {@code [id della sede, numero]}. */
    @org.springframework.data.jpa.repository.Query("select m.sede.id, count(m) from Movimento m group by m.sede.id")
    List<Object[]> contaPerSede();

    /** Se la categoria e' usata da movimenti con uno di quei documenti (le retribuzioni). */
    boolean existsByCategoriaIdAndDocumentoIn(Long categoriaId, java.util.Collection<Documento> documenti);

    /** Quanti movimenti ha ogni categoria: {@code [id, numero]}. */
    @org.springframework.data.jpa.repository.Query("select m.categoria.id, count(m) from Movimento m where m.categoria is not null group by m.categoria.id")
    List<Object[]> contaPerCategoria();

    /** Quanti movimenti ha ogni dipendente: {@code [id, numero]}. */
    @org.springframework.data.jpa.repository.Query("select m.dipendente.id, count(m) from Movimento m where m.dipendente is not null group by m.dipendente.id")
    List<Object[]> contaPerDipendente();

    long countByCategoriaId(Long id);

    long countByFornitoreId(Long id);

    long countByDipendenteId(Long id);

    // Spostamenti in blocco (eliminazione e unione di voci): la voce nuova puo' essere null (= senza voce).
    @org.springframework.data.jpa.repository.Modifying(flushAutomatically = true, clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query("update Movimento m set m.categoria = :nuova where m.categoria.id = :id")
    int spostaCategoria(@org.springframework.data.repository.query.Param("id") Long id, @org.springframework.data.repository.query.Param("nuova") Categoria nuova);

    @org.springframework.data.jpa.repository.Modifying(flushAutomatically = true, clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query("update Movimento m set m.fornitore = :nuova where m.fornitore.id = :id")
    int spostaFornitore(@org.springframework.data.repository.query.Param("id") Long id, @org.springframework.data.repository.query.Param("nuova") Fornitore nuova);

    @org.springframework.data.jpa.repository.Modifying(flushAutomatically = true, clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query("update Movimento m set m.dipendente = :nuova where m.dipendente.id = :id")
    int spostaDipendente(@org.springframework.data.repository.query.Param("id") Long id, @org.springframework.data.repository.query.Param("nuova") Dipendente nuova);

    boolean existsByRicorrenzaIdAndData(Long ricorrenzaId, LocalDate data);
}
