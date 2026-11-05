package it.contabilita.dati;

import jakarta.persistence.*;

@Entity
@Table(name = "categoria")
public class Categoria {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String nome;

    @Column(name = "nome_chiave", nullable = false)
    private String nomeChiave;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Tipo tipo;

    /** Vera per le categorie di COSTO_FISSO che sono retribuzioni: i loro movimenti hanno documento RETRIBUZIONE_*. */
    @Column(nullable = false)
    private boolean retribuzione = false;

    protected Categoria() {
    }

    public Categoria(String nome, String nomeChiave, Tipo tipo) {
        this.nome = nome;
        this.nomeChiave = nomeChiave;
        this.tipo = tipo;
    }

    public void rinomina(String nome, String nomeChiave) {
        this.nome = nome;
        this.nomeChiave = nomeChiave;
    }

    public void setRetribuzione(boolean retribuzione) {
        this.retribuzione = retribuzione;
    }

    public Long getId() { return id; }
    public String getNome() { return nome; }
    public String getNomeChiave() { return nomeChiave; }
    public Tipo getTipo() { return tipo; }
    public boolean isRetribuzione() { return retribuzione; }
}
