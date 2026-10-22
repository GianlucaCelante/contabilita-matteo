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
                        Files.copy(file, destinazione.resolve(origine.relativize(file).toString()), StandardCopyOption.COPY_ATTRIBUTES);
                    } catch (java.nio.file.NoSuchFileException sparito) {
                        // un file temporaneo di scrittura spostato mentre si copiava: non e' un allegato
                    }
                }
                return FileVisitResult.CONTINUE;
            }
        });
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
