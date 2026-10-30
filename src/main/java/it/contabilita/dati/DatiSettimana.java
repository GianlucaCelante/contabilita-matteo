package it.contabilita.dati;

import jakarta.persistence.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** Pizze e ordini di una sede in una settimana (caricati a mano); {@code settimana} e' sempre il lunedi'. */
@Entity
@Table(name = "dati_settimana")
public class DatiSettimana {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sede_id", nullable = false)
    private Sede sede;

    @Convert(converter = ConvertitoreData.class)
    @Column(nullable = false)
    private LocalDate settimana;

    @Column(nullable = false)
    private int pizze;

    @Column(nullable = false)
    private int ordini;

    @Convert(converter = ConvertitoreIstante.class)
    @Column(name = "modificato_il", nullable = false)
    private LocalDateTime modificatoIl;

    protected DatiSettimana() {
    }

    public DatiSettimana(Sede sede, LocalDate settimana, int pizze, int ordini, LocalDateTime modificatoIl) {
        this.sede = sede;
        this.settimana = settimana;
        this.pizze = pizze;
        this.ordini = ordini;
        this.modificatoIl = modificatoIl;
    }

    public Long getId() { return id; }
    public Sede getSede() { return sede; }
    public LocalDate getSettimana() { return settimana; }
    public int getPizze() { return pizze; }
    public void setPizze(int pizze) { this.pizze = pizze; }
    public int getOrdini() { return ordini; }
    public void setOrdini(int ordini) { this.ordini = ordini; }
    public LocalDateTime getModificatoIl() { return modificatoIl; }
    public void setModificatoIl(LocalDateTime modificatoIl) { this.modificatoIl = modificatoIl; }
}
