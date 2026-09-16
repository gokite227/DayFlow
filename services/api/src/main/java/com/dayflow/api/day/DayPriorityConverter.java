package com.dayflow.api.day;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Maps DayPriority to the existing days.priority integer column (0=NONE … 3=HIGH). */
@Converter
public class DayPriorityConverter implements AttributeConverter<DayPriority, Integer> {

    @Override
    public Integer convertToDatabaseColumn(DayPriority priority) {
        return priority == null ? null : priority.level();
    }

    @Override
    public DayPriority convertToEntityAttribute(Integer level) {
        return level == null ? null : DayPriority.ofLevel(level);
    }
}
