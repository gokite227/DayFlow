# DayFlow API container image (see infra/README.md "Server deployment").
# Build from services/api:  docker build -t dayflow-api .
# Tests are not run here: they need Docker (Testcontainers) and run in CI / locally with ./mvnw package.

FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace
# Dependencies first, so source changes do not download them again.
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B -ntp dependency:go-offline
COPY src src
RUN ./mvnw -B -ntp -DskipTests package && cp target/dayflow-api-*.jar app.jar

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd --system dayflow && useradd --system --gid dayflow --home /app dayflow
COPY --from=build /workspace/app.jar app.jar
USER dayflow
# Every setting comes from the environment; the prod profile refuses unsafe or missing auth values.
ENV SPRING_PROFILES_ACTIVE=prod \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"
EXPOSE 8080
# The platform health check should call GET /actuator/health.
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
