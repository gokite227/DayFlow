// Exports the Spring Boot OpenAPI document (/v3/api-docs) to openapi/dayflow-api.json.
// Runs OpenApiSpecExportTest in services/api, so it needs JDK 21 (JAVA_HOME) and Docker
// for the Testcontainers PostgreSQL. No running API server is required.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.resolve(packageDir, "../../services/api");
// Relative to apiDir, which is the working directory of the Maven test JVM.
const outputPath = path.relative(apiDir, path.join(packageDir, "openapi", "dayflow-api.json"));

const mavenArgs = [
  "-B",
  "-ntp",
  "test",
  "-Dtest=OpenApiSpecExportTest",
  `-Dopenapi.export.path=${outputPath}`,
];

const result =
  process.platform === "win32"
    ? // ".\" is explicit: cmd may not search the current directory (NoDefaultCurrentDirectoryInExePath).
      spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", ".\\mvnw.cmd", ...mavenArgs], {
        cwd: apiDir,
        stdio: "inherit",
      })
    : spawnSync("./mvnw", mavenArgs, { cwd: apiDir, stdio: "inherit" });

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
