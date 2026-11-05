import { describe, it, expect } from "vitest";
import { sampleModeAllowed } from "../src/lib/runtime-mode";

describe("sample data cannot bypass production login", () => {
  it("allows explicit local development samples", () => {
    expect(
      sampleModeAllowed({ APP_DEMO_MODE: "true", NODE_ENV: "development" }),
    ).toBe(true);
  });
  it("disables samples in a standalone production server", () => {
    expect(
      sampleModeAllowed({ APP_DEMO_MODE: "true", NODE_ENV: "production" }),
    ).toBe(false);
  });
  it("disables samples in all Vercel environments including previews", () => {
    expect(
      sampleModeAllowed({
        APP_DEMO_MODE: "true",
        NODE_ENV: "development",
        VERCEL: "1",
      }),
    ).toBe(false);
  });
});
