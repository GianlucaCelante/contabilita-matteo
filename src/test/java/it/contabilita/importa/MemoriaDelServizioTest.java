package it.contabilita.importa;

import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * s53: la memoria con cui l'installer avvia il servizio ({@code -Xmx512m}) letta dai file veri dell'installer, senza
 * installare niente. I limiti dell'importazione seguono quel valore (docs/api.md, «Quanto si legge in una volta»): se
 * qualcuno lo cambia in un file e non nell'altro, o rompe l'XML, o toglie quello che fa sostituire il file a un
 * aggiornamento, qui si vede. Quello che questo test NON prova (il servizio vero che parte con quella memoria) e' scritto
 * in installer/README.md.
 */
class MemoriaDelServizioTest {

    private static final long MB = 1024 * 1024;
    private static final Path INSTALLER = Path.of("installer");

    private static Document apri(Path file) throws Exception {
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        // il plist dichiara la DTD di Apple: non si scarica (niente rete nei test), il resto si legge lo stesso
        f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        f.setFeature("http://xml.org/sax/features/external-general-entities", false);
        f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        DocumentBuilder b = f.newDocumentBuilder();
        b.setEntityResolver((pubblico, sistema) -> new InputSource(new StringReader("")));
        assertThat(file).exists();
        return b.parse(file.toFile()); // un XML non ben formato qui lancia: il test fallisce
    }

    /** I megabyte dell'unico {@code -Xmx} fra gli argomenti, che deve stare prima di {@code -jar} (dopo sarebbe un argomento del programma). */
    private static long xmxInMegabyte(List<String> argomenti, String dove) {
        List<String> xmx = argomenti.stream().filter(a -> a.startsWith("-Xmx")).toList();
        assertThat(xmx).as("%s: un solo -Xmx", dove).hasSize(1);
        assertThat(argomenti.indexOf(xmx.get(0))).as("%s: -Xmx prima di -jar", dove).isLessThan(argomenti.indexOf("-jar"));
        assertThat(xmx.get(0)).as(dove).matches("-Xmx\\d+m");
        return Long.parseLong(xmx.get(0).substring(4, xmx.get(0).length() - 1));
    }

    private static long xmxDiWindows() throws Exception {
        Document d = apri(INSTALLER.resolve("Contabilita.xml"));
        assertThat(d.getDocumentElement().getNodeName()).isEqualTo("service");
        NodeList argomenti = d.getElementsByTagName("arguments");
        assertThat(argomenti.getLength()).as("un solo <arguments>").isEqualTo(1);
        return xmxInMegabyte(Arrays.asList(argomenti.item(0).getTextContent().trim().split("\\s+")), "Contabilita.xml");
    }

    private static long xmxDelMac() throws Exception {
        Document d = apri(INSTALLER.resolve("mac/launchd/it.contabilita.servizio.plist"));
        NodeList figli = ((Element) d.getElementsByTagName("dict").item(0)).getChildNodes();
        List<String> argomenti = new ArrayList<>();
        for (int i = 0; i < figli.getLength(); i++) {
            if ("key".equals(figli.item(i).getNodeName()) && "ProgramArguments".equals(figli.item(i).getTextContent())) {
                int j = i + 1;
                while (!(figli.item(j) instanceof Element)) {
                    j++;
                }
                NodeList stringhe = ((Element) figli.item(j)).getElementsByTagName("string");
                for (int k = 0; k < stringhe.getLength(); k++) {
                    argomenti.add(stringhe.item(k).getTextContent());
                }
            }
        }
        assertThat(argomenti).as("ProgramArguments del plist").isNotEmpty();
        return xmxInMegabyte(argomenti, "it.contabilita.servizio.plist");
    }

    @Test
    void ilServizioWindowsParteCon512MegabyteELXmlEBenFormato() throws Exception {
        assertThat(xmxDiWindows()).isEqualTo(512);
    }

    @Test
    void ilServizioDelMacParteConLaStessaMemoria() throws Exception {
        assertThat(xmxDelMac()).isEqualTo(xmxDiWindows());
    }

    @Test
    void iLimitiScrittiNellaDocumentazioneSonoQuelliDellaMemoriaDellInstaller() throws Exception {
        long memoria = xmxDiWindows() * MB;
        assertThat(ImportazioneService.limiteLettura(200 * MB, memoria)).isEqualTo(128 * MB); // «128 MB» in docs/api.md
        assertThat(ImportazioneService.limiteFile(memoria)).isEqualTo(16 * MB);               // «16 MB»
        assertThat(ImportazioneService.tettoEffettivo(96 * MB, memoria)).isEqualTo(96 * MB);  // «96 MB»
    }

    // L'aggiornamento sostituisce Contabilita.xml (e quindi la memoria) perche' l'MSI toglie tutta la versione di prima
    // PRIMA di copiare i file nuovi: con RemoveExistingProducts in fondo varrebbero le regole di Windows Installer sui file
    // senza versione, che non sostituiscono un file modificato a mano dopo l'installazione.
    @Test
    void lMsiToglieLaVersioneDiPrimaPrimaDiCopiareIFileNuovi() throws Exception {
        Document d = apri(INSTALLER.resolve("wix/main.install.wxs"));
        NodeList rimozioni = d.getElementsByTagName("RemoveExistingProducts");
        assertThat(rimozioni.getLength()).isEqualTo(1);
        Element rimozione = (Element) rimozioni.item(0);
        assertThat(rimozione.getParentNode().getNodeName()).isEqualTo("InstallExecuteSequence");
        assertThat(rimozione.getAttribute("After")).isEqualTo("InstallInitialize");
        // ogni build ha un codice prodotto nuovo: anche con lo stesso numero di versione e' un aggiornamento, non una «manutenzione»
        assertThat(((Element) d.getElementsByTagName("Product").item(0)).getAttribute("Id")).isEqualTo("*");
    }

    @Test
    void laBuildMetteNellMsiProprioQuestoXml() throws Exception {
        String build = Files.readString(INSTALLER.resolve("Build-Setup.ps1"));
        assertThat(build).contains("$WinswXmlSource = Join-Path $ScriptDir \"Contabilita.xml\"")
                .contains("Copy-Item $WinswXmlSource -Destination (Join-Path $StageDir \"Contabilita.xml\")")
                .contains("\"--input\", $StageDir");
        // e il pacchetto del Mac il suo plist
        assertThat(Files.readString(INSTALLER.resolve("mac/Build-Setup.sh")))
                .contains("cp \"$QUI/launchd/it.contabilita.servizio.plist\" \"$STAGE/Library/LaunchDaemons/\"");
    }
}
