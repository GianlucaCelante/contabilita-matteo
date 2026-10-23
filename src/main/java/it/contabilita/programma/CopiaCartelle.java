package it.contabilita.programma;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Comparator;
import java.util.stream.Stream;

/** Copia e cancellazione ricorsive di cartelle (nessuna dipendenza da Spring). I collegamenti simbolici non si seguono. */
final class CopiaCartelle {

    private CopiaCartelle() {
    }

    /** Copia il contenuto di {@code origine} in {@code destinazione} (creata). */
    static void copia(Path origine, Path destinazione) throws IOException {
        copia(origine, destinazione, null);
    }

    /**
     * Come {@link #copia(Path, Path)}, ma un file che in {@code riferimento} (una copia precedente, puo' essere
     * null) esiste con lo stesso percorso e la stessa dimensione non si ricopia: si crea un collegamento fisso a
     * quello gia' copiato. La nuova cartella resta completa e indipendente (cancellare la vecchia non toglie
     * nulla), ma non occupa altro spazio ne' tempo. Se i collegamenti non sono possibili (altro volume, FAT) si copia.
     */
    static void copia(Path origine, Path destinazione, Path riferimento) throws IOException {
        Files.walkFileTree(origine, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                Files.createDirectories(destinazione.resolve(origine.relativize(dir).toString()));
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                if (attrs.isRegularFile()) {
                    try {
                        Path relativo = Path.of(origine.relativize(file).toString());
                        Path nuovo = destinazione.resolve(relativo.toString());
                        if (!collegaAlRiferimento(riferimento, relativo, attrs.size(), nuovo)) {
                            Files.copy(file, nuovo, StandardCopyOption.COPY_ATTRIBUTES);
                        }
                    } catch (java.nio.file.NoSuchFileException sparito) {
                        // un file temporaneo di scrittura spostato mentre si copiava: non e' un allegato
                    }
                }
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private static boolean collegaAlRiferimento(Path riferimento, Path relativo, long dimensione, Path nuovo) {
        if (riferimento == null) {
            return false;
        }
        Path vecchio = riferimento.resolve(relativo.toString());
        try {
            if (!Files.isRegularFile(vecchio, java.nio.file.LinkOption.NOFOLLOW_LINKS) || Files.size(vecchio) != dimensione) {
                return false;
            }
            Files.createLink(nuovo, vecchio);
            return true;
        } catch (IOException | UnsupportedOperationException | SecurityException e) {
            return false;
        }
    }

    /** Elimina la cartella con tutto il contenuto; se non esiste non fa nulla. */
    static void elimina(Path radice) throws IOException {
        if (!Files.exists(radice)) {
            return;
        }
        try (Stream<Path> tutti = Files.walk(radice)) {
            for (Path p : tutti.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(p);
            }
        }
    }
}
