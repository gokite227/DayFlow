# DayFlow API container image (Railway: Root Directory /services/api, see infra/README.md).
# Build from services/api:  docker build -t dayflow-api .
# Tests are not compiled or run here: they need Docker (Testcontainers) and run locally with ./mvnw package.

FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace
# Dependencies first, so source changes do not download them again.
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B -ntp dependency:go-offline
COPY src/main src/main
RUN ./mvnw -B -ntp -Dmaven.test.skip=true package && cp target/dayflow-api-*.jar app.jar

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd --system dayflow && useradd --system --gid dayflow --home /app dayflow
COPY --from=build /workspace/app.jar app.jar
USER dayflow
# Every setting comes from the environment; the prod profile refuses unsafe or missing auth values.
# JAVA_TOOL_OPTIONS can be overridden per deployment (see infra/README.md "Memory").
ENV SPRING_PROFILES_ACTIVE=prod \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"
# Railway sets PORT; application-prod.yml listens on it (8080 when unset).
EXPOSE 8080
# The platform health check calls GET /actuator/health.
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
