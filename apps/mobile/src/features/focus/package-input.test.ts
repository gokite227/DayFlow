import { describe, expect, it } from "vitest";
import { parsePackageInput } from "./package-input";

describe("Focus POC package input", () => {
  it("splits on commas, spaces and new lines and removes duplicates", () => {
    expect(parsePackageInput(" com.instagram.android,\ncom.google.android.youtube  com.instagram.android ")).toEqual({
      packages: ["com.instagram.android", "com.google.android.youtube"],
      invalid: [],
    });
  });

  it("reports names that are not Android package names", () => {
    expect(parsePackageInput("instagram, com.instagram.android, 1abc.def")).toEqual({ packages: ["com.instagram.android"], invalid: ["instagram", "1abc.def"] });
    expect(parsePackageInput("  ")).toEqual({ packages: [], invalid: [] });
  });
});
