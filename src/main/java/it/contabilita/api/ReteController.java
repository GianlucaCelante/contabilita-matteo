package it.contabilita.api;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import it.contabilita.rete.IndirizziRete;
import it.contabilita.rete.IndirizziRete.IndirizzoLan;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.ByteArrayOutputStream;
import java.util.List;

/** {@code GET /api/rete} e {@code GET /api/rete/qr.png?ip=}. */
@RestController
@RequestMapping("/api/rete")
public class ReteController {

    private static final int LATO_QR_PX = 300;

    public record IndirizzoDto(String ip, String tipo) {
    }

    public record ReteDto(int porta, List<IndirizzoDto> indirizzi) {
    }

    private final IndirizziRete indirizziRete;
    private final int porta;

    public ReteController(IndirizziRete indirizziRete, @Value("${server.port}") int porta) {
        this.indirizziRete = indirizziRete;
        this.porta = porta;
    }

    /** Gli indirizzi del PC in LAN, il primo e' il principale (Wi-Fi prima del cavo). */
    @GetMapping
    public ReteDto rete() {
        List<IndirizzoDto> indirizzi = indirizziRete.trovaIndirizziLanConScheda().stream()
                .map(l -> new IndirizzoDto(l.indirizzo().getHostAddress(), l.tipo().name()))
                .toList();
        return new ReteDto(porta, indirizzi);
    }

    /**
     * Il QR di {@code http://ip:porta/}. L'ip deve essere uno degli indirizzi correnti del PC
     * (il servizio non genera mai un QR per un testo qualsiasi); senza {@code ip} si usa il primo.
     */
    @GetMapping(value = "/qr.png", produces = MediaType.IMAGE_PNG_VALUE)
    public byte[] qr(@RequestParam(required = false) String ip) throws Exception {
        List<IndirizzoLan> lan = indirizziRete.trovaIndirizziLanConScheda();
        if (lan.isEmpty()) {
            throw new ErroreApi(HttpStatus.SERVICE_UNAVAILABLE, "nessun indirizzo di rete disponibile");
        }
        String scelto = lan.get(0).indirizzo().getHostAddress();
        if (ip != null && !ip.isBlank()) {
            String richiesto = ip.trim();
            if (lan.stream().noneMatch(l -> l.indirizzo().getHostAddress().equals(richiesto))) {
                throw new ErroreApi(HttpStatus.BAD_REQUEST, "indirizzo non riconosciuto: " + ip);
            }
            scelto = richiesto;
        }
        BitMatrix matrice = new MultiFormatWriter().encode("http://" + scelto + ":" + porta + "/",
                BarcodeFormat.QR_CODE, LATO_QR_PX, LATO_QR_PX);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        MatrixToImageWriter.writeToStream(matrice, "PNG", out);
        return out.toByteArray();
    }
}
