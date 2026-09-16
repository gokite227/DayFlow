package com.dayflow.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class DayFlowApplication {

    public static void main(String[] args) {
        SpringApplication.run(DayFlowApplication.class, args);
    }
}
