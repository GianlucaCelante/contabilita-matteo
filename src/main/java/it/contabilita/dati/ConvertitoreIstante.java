package it.contabilita.dati;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.time.LocalDateTime;

/** LocalDateTime come testo ISO. */
@Converter
public class ConvertitoreIstante implements AttributeConverter<LocalDateTime, String> {
    @Override
    public String convertToDatabaseColumn(LocalDateTime valore) {
        return valore == null ? null : valore.toString();
    }

    @Override
    public LocalDateTime convertToEntityAttribute(String testo) {
        return testo == null ? null : LocalDateTime.parse(testo);
    }
}
