package it.contabilita.dati;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/** Una sede della pizzeria. Non si cancella: se ha movimenti si archivia (resta nei dati, sparisce dalle scelte). */
@Entity
@Table(name = "sede")
public class Sede {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String nome;

    @Column(name = "nome_chiave", nullable = false)
    private String nomeChiave;

    @Column(nullable = false)
    private boolean archiviata;

    /** Posizione negli elenchi (e ordine in cui si assegnano i centesimi di resto di una divisione). */
    @Column(nullable = false)
    private int ordine;

    @Convert(converter = ConvertitoreIstante.class)
    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;

    protected Sede() {
    }

    public Sede(String nome, String nomeChiave, int ordine, LocalDateTime creatoIl) {
        this.nome = nome;
        this.nomeChiave = nomeChiave;
        this.ordine = ordine;
        this.creatoIl = creatoIl;
    }

    public Long getId() { return id; }
    public String getNome() { return nome; }
    public void setNome(String nome) { this.nome = nome; }
    public String getNomeChiave() { return nomeChiave; }
    public void setNomeChiave(String nomeChiave) { this.nomeChiave = nomeChiave; }
    public boolean isArchiviata() { return archiviata; }
    public void setArchiviata(boolean archiviata) { this.archiviata = archiviata; }
    public int getOrdine() { return ordine; }
    public void setOrdine(int ordine) { this.ordine = ordine; }
    public LocalDateTime getCreatoIl() { return creatoIl; }
}
