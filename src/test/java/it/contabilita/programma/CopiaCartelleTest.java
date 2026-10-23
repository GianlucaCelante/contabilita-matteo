package it.contabilita.programma;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/** Copia incrementale degli allegati: i file gia' nella copia precedente non si ricopiano, ma ogni copia resta completa. */
class CopiaCartelleTest {

    @TempDir
    Path radice;

    private Path scrivi(Path cartella, String relativo, String contenuto) throws Exception {
        Path file = cartella.resolve(relativo);
        Files.createDirectories(file.getParent());
        return Files.writeString(file, contenuto);
    }

    @Test
    void unFileGiaNelRiferimentoNonSiRicopiaMaLaCopiaRestaCompleta() throws Exception {
        Path origine = radice.resolve("origine");
        scrivi(origine, "a.jpg", "AAAA");
        scrivi(origine, "sotto/b.pdf", "BB");
        Path prima = radice.resolve("prima");
        CopiaCartelle.copia(origine, prima);

        scrivi(origine, "nuovo.png", "NUOVO");
        Path dopo = radice.resolve("dopo");
        CopiaCartelle.copia(origine, dopo, prima);

        assertThat(dopo.resolve("a.jpg")).hasContent("AAAA");
        assertThat(dopo.resolve("sotto/b.pdf")).hasContent("BB");
        assertThat(dopo.resolve("nuovo.png")).hasContent("NUOVO");
        assertThat(Files.isSameFile(dopo.resolve("a.jpg"), prima.resolve("a.jpg"))).isTrue();
        assertThat(Files.isSameFile(dopo.resolve("sotto/b.pdf"), prima.resolve("sotto/b.pdf"))).isTrue();
        assertThat(prima.resolve("nuovo.png")).doesNotExist();
    }

    @Test
    void cancellareLaCopiaPrecedenteNonToglieNullaALaNuova() throws Exception {
        Path origine = radice.resolve("origine");
        scrivi(origine, "a.jpg", "AAAA");
        Path prima = radice.resolve("prima");
        CopiaCartelle.copia(origine, prima);
        Path dopo = radice.resolve("dopo");
        CopiaCartelle.copia(origine, dopo, prima);

        CopiaCartelle.elimina(prima);

        assertThat(dopo.resolve("a.jpg")).hasContent("AAAA");
    }

    @Test
    void unFileConDimensioneDiversaSiRicopia() throws Exception {
        Path origine = radice.resolve("origine");
        scrivi(origine, "a.jpg", "AAAA");
        Path prima = radice.resolve("prima");
        scrivi(prima, "a.jpg", "vecchio e piu' lungo");

        Path dopo = radice.resolve("dopo");
        CopiaCartelle.copia(origine, dopo, prima);

        assertThat(dopo.resolve("a.jpg")).hasContent("AAAA");
        assertThat(prima.resolve("a.jpg")).hasContent("vecchio e piu' lungo");
        assertThat(Files.isSameFile(dopo.resolve("a.jpg"), prima.resolve("a.jpg"))).isFalse();
    }

    @Test
    void senzaRiferimentoOConRiferimentoInesistenteSiCopiaTutto() throws Exception {
        Path origine = radice.resolve("origine");
        scrivi(origine, "a.jpg", "AAAA");

        CopiaCartelle.copia(origine, radice.resolve("uno"), null);
        CopiaCartelle.copia(origine, radice.resolve("due"), radice.resolve("non-esiste"));

        assertThat(radice.resolve("uno/a.jpg")).hasContent("AAAA");
        assertThat(radice.resolve("due/a.jpg")).hasContent("AAAA");
    }
}
