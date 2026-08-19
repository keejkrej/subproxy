import { describe, expect, it } from "vitest";
import { healthFromExpiry, shouldRefresh } from "./health";

describe("session health", () => {
  const now = new Date("2026-08-19T12:00:00.000Z");

  it("is healthy when expiry is more than two hours away", () => {
    expect(healthFromExpiry(new Date("2026-08-19T16:00:00.000Z"), now)).toBe("healthy");
    expect(shouldRefresh(new Date("2026-08-19T16:00:00.000Z"), now)).toBe(false);
  });

  it("is expiring inside the two-hour window", () => {
    expect(healthFromExpiry(new Date("2026-08-19T13:00:00.000Z"), now)).toBe("expiring");
    expect(shouldRefresh(new Date("2026-08-19T13:00:00.000Z"), now)).toBe(true);
  });

  it("is expired after the timestamp", () => {
    expect(healthFromExpiry(new Date("2026-08-19T11:59:00.000Z"), now)).toBe("expired");
  });
});
