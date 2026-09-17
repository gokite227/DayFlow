import { describe, expect, it } from "vitest";
import { describeApiConfigProblem, resolveApiConfig } from "./api-config";

describe("API base URL validation", () => {
  it("requires a value instead of falling back to localhost", () => {
    expect(resolveApiConfig(undefined)).toEqual({ ok: false, reason: "missing", raw: "" });
    expect(resolveApiConfig("   ")).toMatchObject({ ok: false, reason: "missing" });
  });

  it("accepts http(s) origins and trims trailing slashes", () => {
    expect(resolveApiConfig("http://192.168.0.10:8080/")).toEqual({
      ok: true,
      baseUrl: "http://192.168.0.10:8080",
      loopback: false,
    });
    expect(resolveApiConfig(" https://api.dayflow.app ")).toEqual({
      ok: true,
      baseUrl: "https://api.dayflow.app",
      loopback: false,
    });
  });

  it("accepts the production Railway API URL as a non-loopback HTTPS base", () => {
    expect(resolveApiConfig("https://dayflow-api.up.railway.app/")).toEqual({
      ok: true,
      baseUrl: "https://dayflow-api.up.railway.app",
      loopback: false,
    });
  });

  it("flags loopback hosts, which only work on simulators", () => {
    expect(resolveApiConfig("http://localhost:8080")).toMatchObject({ ok: true, loopback: true });
    expect(resolveApiConfig("http://127.0.0.1:8080")).toMatchObject({ ok: true, loopback: true });
    expect(resolveApiConfig("http://10.0.2.2:8080")).toMatchObject({ ok: true, loopback: false });
  });

  it("rejects values that are not http(s) URLs with an understandable message", () => {
    const invalid = resolveApiConfig("192.168.0.10:8080");
    expect(invalid).toMatchObject({ ok: false, reason: "invalid" });
    if (!invalid.ok) expect(describeApiConfigProblem(invalid)).toContain("192.168.0.10:8080");
    expect(resolveApiConfig("ftp://example.com")).toMatchObject({ ok: false, reason: "invalid" });
    const missing = resolveApiConfig("");
    if (!missing.ok) expect(describeApiConfigProblem(missing)).toContain("EXPO_PUBLIC_DAYFLOW_API_BASE_URL");
  });
});