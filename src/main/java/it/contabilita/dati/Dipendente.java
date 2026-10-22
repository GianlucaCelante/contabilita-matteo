package it.contabilita.dati;

import jakarta.persistence.*;

@Entity
@Table(name = "dipendente")
public class Dipendente {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String nome;

    @Column(name = "nome_chiave", nullable = false)
    private String nomeChiave;

    protected Dipendente() {
    }

    public Dipendente(String nome, String nomeChiave) {
        this.nome = nome;
        this.nomeChiave = nomeChiave;
    }

    public Long getId() { return id; }
    public String getNome() { return nome; }
    public String getNomeChiave() { return nomeChiave; }
}
