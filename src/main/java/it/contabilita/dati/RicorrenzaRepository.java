package it.contabilita.dati;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RicorrenzaRepository extends JpaRepository<Ricorrenza, Long> {
    List<Ricorrenza> findByAttivaTrueOrderById();

    /** Se la categoria e' usata da ripetizioni con uno di quei documenti (le retribuzioni). */
    boolean existsByCategoriaIdAndDocumentoIn(Long categoriaId, java.util.Collection<Documento> documenti);

    @org.springframework.data.jpa.repository.Modifying(flushAutomatically = true, clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query("update Ricorrenza r set r.categoria = :nuova where r.categoria.id = :id")
    int spostaCategoria(@org.springframework.data.repository.query.Param("id") Long id, @org.springframework.data.repository.query.Param("nuova") Categoria nuova);

    @org.springframework.data.jpa.repository.Modifying(flushAutomatically = true, clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query("update Ricorrenza r set r.fornitore = :nuova where r.fornitore.id = :id")
    int spostaFornitore(@org.springframework.data.repository.query.Param("id") Long id, @org.springframework.data.repository.query.Param("nuova") Fornitore nuova);

    @org.springframework.data.jpa.repository.Modifying(flushAutomatically = true, clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query("update Ricorrenza r set r.dipendente = :nuova where r.dipendente.id = :id")
    int spostaDipendente(@org.springframework.data.repository.query.Param("id") Long id, @org.springframework.data.repository.query.Param("nuova") Dipendente nuova);
}
