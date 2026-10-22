package it.contabilita.dati;

import jakarta.persistence.*;

@Entity
@Table(name = "fornitore")
public class Fornitore {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String nome;

    @Column(name = "nome_chiave", nullable = false)
    private String nomeChiave;

    @Column(name = "partita_iva")
    private String partitaIva;

    protected Fornitore() {
    }

    public Fornitore(String nome, String nomeChiave, String partitaIva) {
        this.nome = nome;
        this.nomeChiave = nomeChiave;
        this.partitaIva = partitaIva;
    }

    public Long getId() { return id; }
    public String getNome() { return nome; }
    public String getNomeChiave() { return nomeChiave; }
    public String getPartitaIva() { return partitaIva; }
    public void setPartitaIva(String partitaIva) { this.partitaIva = partitaIva; }
}
