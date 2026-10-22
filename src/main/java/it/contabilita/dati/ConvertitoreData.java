package it.contabilita.dati;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.time.LocalDate;

/** LocalDate come testo ISO (yyyy-MM-dd): confronti e ordinamenti SQL restano corretti. */
@Converter
public class ConvertitoreData implements AttributeConverter<LocalDate, String> {
    @Override
    public String convertToDatabaseColumn(LocalDate valore) {
        return valore == null ? null : valore.toString();
    }

    @Override
    public LocalDate convertToEntityAttribute(String testo) {
        return testo == null ? null : LocalDate.parse(testo);
    }
}
