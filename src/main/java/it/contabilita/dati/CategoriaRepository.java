package it.contabilita.dati;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CategoriaRepository extends JpaRepository<Categoria, Long> {
    Optional<Categoria> findByNomeChiaveAndTipo(String nomeChiave, Tipo tipo);

    List<Categoria> findByTipoOrderByNomeChiave(Tipo tipo);

    List<Categoria> findAllByOrderByNomeChiave();
}
