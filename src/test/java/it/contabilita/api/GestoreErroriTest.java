package it.contabilita.api;

import it.contabilita.ProvaBase;
import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** {@link GestoreErrori}: ogni errore risponde {@code {"errore": "..."}} con il codice giusto, mai 500. */
class GestoreErroriTest extends ProvaBase {

    @Test
    void unMetodoNonSupportatoSuUnaRottaEsistenteRisponde405() throws Exception {
        mockMvc.perform(patch("/api/fornitori").contentType("application/json").content("{}"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.errore").value("Metodo non ammesso per questo indirizzo."));
    }

    @Test
    void unaRottaApiInesistenteRisponde404ConErroreJson() throws Exception {
        mockMvc.perform(post("/api/rotta-che-non-esiste").contentType("application/json").content("{}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errore").exists());
    }

    @Test
    void unCorpoJsonIlleggibileRisponde400() throws Exception {
        mockMvc.perform(post("/api/fornitori").contentType("application/json").content("{rotto"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errore").value("Richiesta non leggibile: JSON non valido."));
    }

    @Test
    void unEnumSconosciutoNominaIlCampo() throws Exception {
        mockMvc.perform(post("/api/categorie").contentType("application/json").content("{\"nome\":\"A\",\"tipo\":\"BOH\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errore").value("Valore non valido per «tipo»: BOH"));
    }
}
