package it.contabilita.dati;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DipendenteRepository extends JpaRepository<Dipendente, Long> {
    Optional<Dipendente> findByNomeChiave(String nomeChiave);

    List<Dipendente> findAllByOrderByNomeChiave();
}
