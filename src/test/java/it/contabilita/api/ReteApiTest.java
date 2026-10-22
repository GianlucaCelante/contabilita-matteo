package it.contabilita.api;

import it.contabilita.ProvaBase;
import it.contabilita.rete.IndirizziRete;
import it.contabilita.rete.IndirizziRete.IndirizzoLan;
import it.contabilita.rete.IndirizziRete.TipoScheda;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** {@code GET /api/rete} e {@code GET /api/rete/qr.png}; gli indirizzi sono finti (quelli veri cambiano da PC a PC). */
class ReteApiTest extends ProvaBase {

    @MockitoBean
    private IndirizziRete indirizziRete;

    @Value("${server.port}")
    private int porta;

    private static Inet4Address ip(int a, int b, int c, int d) throws Exception {
        return (Inet4Address) InetAddress.getByAddress(new byte[]{(byte) a, (byte) b, (byte) c, (byte) d});
    }

    @Test
    void laPortaE8766EGliIndirizziHannoIpETipoInMaiuscolo() throws Exception {
        when(indirizziRete.trovaIndirizziLanConScheda()).thenReturn(List.of(
                new IndirizzoLan(ip(192, 168, 1, 41), TipoScheda.WIFI, "Intel Wi-Fi"),
                new IndirizzoLan(ip(192, 168, 4, 20), TipoScheda.CAVO, "Realtek GbE"),
                new IndirizzoLan(ip(10, 1, 1, 1), TipoScheda.ALTRO, "Altra")));
        assertThat(porta).isEqualTo(8766);
        mockMvc.perform(get("/api/rete"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.porta").value(8766))
                .andExpect(jsonPath("$.indirizzi.length()").value(3))
                .andExpect(jsonPath("$.indirizzi[0].ip").value("192.168.1.41"))
                .andExpect(jsonPath("$.indirizzi[0].tipo").value("WIFI"))
                .andExpect(jsonPath("$.indirizzi[1].tipo").value("CAVO"))
                .andExpect(jsonPath("$.indirizzi[2].tipo").value("ALTRO"));
    }

    @Test
    void senzaReteLElencoEVuoto() throws Exception {
        when(indirizziRete.trovaIndirizziLanConScheda()).thenReturn(List.of());
        mockMvc.perform(get("/api/rete"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.indirizzi.length()").value(0));
        mockMvc.perform(get("/api/rete/qr.png")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.errore").exists());
    }

    @Test
    void ilQrEUnPngEUnIpSconosciutoDa400() throws Exception {
        when(indirizziRete.trovaIndirizziLanConScheda()).thenReturn(List.of(
                new IndirizzoLan(ip(192, 168, 1, 41), TipoScheda.WIFI, "Intel Wi-Fi"),
                new IndirizzoLan(ip(192, 168, 4, 20), TipoScheda.CAVO, "Realtek GbE")));
        byte[] png = mockMvc.perform(get("/api/rete/qr.png"))
                .andExpect(status().isOk())
                .andExpect(content().contentType("image/png"))
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(png).startsWith((byte) 0x89, (byte) 'P', (byte) 'N', (byte) 'G');
        byte[] secondo = mockMvc.perform(get("/api/rete/qr.png?ip=192.168.4.20"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        assertThat(secondo).startsWith((byte) 0x89, (byte) 'P', (byte) 'N', (byte) 'G').isNotEqualTo(png);
        mockMvc.perform(get("/api/rete/qr.png?ip=8.8.8.8"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errore").exists());
    }
}
