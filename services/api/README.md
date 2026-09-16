# DayFlow API

Java 21 + Spring Boot 4.1 + PostgreSQL + Flyway (Maven Wrapper).

## Local

```bash
cd services/api && ./mvnw spring-boot:run
```

The default `local` profile reads `infra/.env` (database, optional Google client) and listens on
`http://localhost:8080`. Details and database reset: `infra/README.md`.

## Tests

```bash
cd services/api && ./mvnw clean package
```

Integration tests use Testcontainers PostgreSQL (Docker required).

## Production (Railway)

- Image: `Dockerfile` in this directory (Railway service Root Directory `/services/api`, config file
  `/services/api/railway.json`: Dockerfile builder, health check `GET /actuator/health`).
- Profile `prod` (set by the Dockerfile): listens on `PORT`, trusts `X-Forwarded-*`, Swagger/OpenAPI off,
  and `ProductionConfigValidator` refuses to start with missing or unsafe auth settings.
- Environment variables (names only): `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`,
  `SPRING_DATASOURCE_PASSWORD`, `DAYFLOW_PUBLIC_BASE_URL`, `DAYFLOW_WEB_URL`, `DAYFLOW_ALLOWED_WEB_ORIGINS`,
  `DAYFLOW_JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; optional `DAYFLOW_MOBILE_REDIRECT_URI`,
  `DAYFLOW_REFRESH_COOKIE_SECURE`, `DAYFLOW_REFRESH_COOKIE_SAME_SITE`, `JAVA_TOOL_OPTIONS`.
  Values and the full deploy checklist: `infra/README.md` §3.
