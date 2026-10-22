package it.contabilita.dati;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RicorrenzaRepository extends JpaRepository<Ricorrenza, Long> {
    List<Ricorrenza> findByAttivaTrueOrderById();
}
