package it.contabilita.api;

import it.contabilita.ProvaBase;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** La password per entrare: senza password l'app e' aperta, con la password le API vogliono la sessione. */
class AccessoApiTest extends ProvaBase {

    private static final String COOKIE = "contabilita_sessione";

    private Cookie imposta(String nuova) throws Exception {
        MvcResult r = mockMvc.perform(put("/api/accesso/password").contentType("application/json")
                .content("{\"nuova\":\"" + nuova + "\"}")).andExpect(status().isOk()).andReturn();
        return r.getResponse().getCookie(COOKIE);
    }

    private Cookie entra(String password, int statoAtteso) throws Exception {
        MvcResult r = mockMvc.perform(post("/api/accesso").contentType("application/json")
                .content("{\"password\":\"" + password + "\"}")).andExpect(status().is(statoAtteso)).andReturn();
        return r.getResponse().getCookie(COOKIE);
    }

    @Test
    void senzaPasswordTuttoAperto() throws Exception {
        var stato = leggi("/api/accesso");
        assertThat(stato.get("protetta").asBoolean()).isFalse();
        assertThat(stato.get("autenticato").asBoolean()).isTrue();
        mockMvc.perform(get("/api/sedi")).andExpect(status().isOk());
    }

    @Test
    void conLaPasswordLeApiVoglionoLaSessione() throws Exception {
        Cookie mia = imposta("calcio2026");
        assertThat(mia).isNotNull();
        assertThat(mia.isHttpOnly()).isTrue();

        mockMvc.perform(get("/api/sedi")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/sedi").cookie(new Cookie(COOKIE, "inventato"))).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/sedi").cookie(mia)).andExpect(status().isOk());
        // resta aperto quello che serve per entrare e per capire se il servizio risponde
        mockMvc.perform(get("/api/versione")).andExpect(status().isOk());
        var stato = json.readTree(mockMvc.perform(get("/api/accesso")).andReturn().getResponse().getContentAsString());
        assertThat(stato.get("protetta").asBoolean()).isTrue();
        assertThat(stato.get("autenticato").asBoolean()).isFalse();
    }

    @Test
    void entraConLaPasswordGiustaEEsce() throws Exception {
        imposta("calcio2026");
        entra("sbagliata", 401);
        Cookie sessione = entra("calcio2026", 200);
        assertThat(sessione).isNotNull();
        mockMvc.perform(get("/api/sedi").cookie(sessione)).andExpect(status().isOk());

        mockMvc.perform(delete("/api/accesso").cookie(sessione)).andExpect(status().isNoContent());
        mockMvc.perform(get("/api/sedi").cookie(sessione)).andExpect(status().isUnauthorized());
    }

    @Test
    void laPasswordNonSiVedeNeSiScriveDalleImpostazioni() throws Exception {
        Cookie mia = imposta("calcio2026");
        String tutte = mockMvc.perform(get("/api/impostazioni").cookie(mia)).andReturn().getResponse().getContentAsString();
        assertThat(tutte).doesNotContain("accesso").doesNotContain("calcio2026");
        mockMvc.perform(put("/api/impostazioni").cookie(mia).contentType("application/json")
                .content("{\"accesso.password\":\"x\"}")).andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("SELECT valore FROM impostazione WHERE chiave = 'accesso.password'", String.class))
                .doesNotContain("calcio2026");
    }

    @Test
    void cambiarePasswordVuoleQuellaAttualeEFaCadereLeAltreSessioni() throws Exception {
        Cookie vecchia = imposta("calcio2026");
        mockMvc.perform(put("/api/accesso/password").cookie(vecchia).contentType("application/json")
                .content("{\"attuale\":\"no\",\"nuova\":\"altra-password\"}")).andExpect(status().isForbidden());
        mockMvc.perform(put("/api/accesso/password").cookie(vecchia).contentType("application/json")
                .content("{\"attuale\":\"calcio2026\",\"nuova\":\"abc\"}")).andExpect(status().isBadRequest());

        MvcResult r = mockMvc.perform(put("/api/accesso/password").cookie(vecchia).contentType("application/json")
                .content("{\"attuale\":\"calcio2026\",\"nuova\":\"altra-password\"}")).andExpect(status().isOk()).andReturn();
        Cookie nuova = r.getResponse().getCookie(COOKIE);
        mockMvc.perform(get("/api/sedi").cookie(vecchia)).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/sedi").cookie(nuova)).andExpect(status().isOk());
        entra("calcio2026", 401);
        entra("altra-password", 200);
    }

    @Test
    void toglierePasswordRiapreTutto() throws Exception {
        Cookie mia = imposta("calcio2026");
        MvcResult r = mockMvc.perform(put("/api/accesso/password").cookie(mia).contentType("application/json")
                .content("{\"attuale\":\"calcio2026\",\"nuova\":\"\"}")).andExpect(status().isOk()).andReturn();
        assertThat(json.readTree(r.getResponse().getContentAsString()).get("protetta").asBoolean()).isFalse();
        mockMvc.perform(get("/api/sedi")).andExpect(status().isOk());
    }

    @Test
    void dopoCinqueErroriSiAspetta() throws Exception {
        imposta("calcio2026");
        for (int i = 0; i < 5; i++) entra("no", 401);
        entra("calcio2026", 429);
        orologio.avanza(31);
        entra("calcio2026", 200);
    }

    @Test
    void ilCookieMuoreConIlBrowserELaSessioneScadeSenzaUso() throws Exception {
        imposta("calcio2026");
        MvcResult r = mockMvc.perform(post("/api/accesso").contentType("application/json")
                .content("{\"password\":\"calcio2026\"}")).andExpect(status().isOk()).andReturn();
        Cookie sessione = r.getResponse().getCookie(COOKIE);
        // cookie «di sessione»: nessuna durata, il browser lo butta alla chiusura
        assertThat(sessione.getMaxAge()).isEqualTo(-1);

        orologio.avanza(20 * 60);
        mockMvc.perform(get("/api/sedi").cookie(sessione)).andExpect(status().isOk());
        // ogni uso rinnova i 30 minuti
        orologio.avanza(20 * 60);
        mockMvc.perform(get("/api/sedi").cookie(sessione)).andExpect(status().isOk());
        orologio.avanza(31 * 60);
        mockMvc.perform(get("/api/sedi").cookie(sessione)).andExpect(status().isUnauthorized());
    }
}
