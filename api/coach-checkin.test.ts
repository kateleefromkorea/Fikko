import { describe, expect, it } from "vitest";
import { offsetMinutes } from "./coach-checkin.js";

// Minutes behind UTC, as Date.getTimezoneOffset() reports them (negative when ahead).
describe("offsetMinutes for Australian members in November 2026", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  it.each([
    ["Australia/Sydney", -660],
    ["Australia/Melbourne", -660],
    ["Australia/Adelaide", -630],
    ["Australia/Brisbane", -600],
    ["Australia/Perth", -480],
  ])("%s", (zone, minutes) => {
    expect(offsetMinutes(zone, now)).toBe(minutes);
  });

  it("follows Sydney's winter time in July", () => {
    expect(offsetMinutes("Australia/Sydney", new Date("2027-07-10T00:00:00Z"))).toBe(-600);
  });
});
