import { afterAll, describe, expect, it } from "vitest";
import { localDateKey, periodRange, shiftDateKey } from "./dates";

// dates.ts uses the device's own time zone, so these run with the process time
// zone set to each Australian zone in turn.
const original = process.env.TZ;
afterAll(() => {
  if (original === undefined) delete process.env.TZ;
  else process.env.TZ = original;
});
const inZone = (zone: string, fn: () => void) => {
  process.env.TZ = zone;
  fn();
};

describe("day keys in Australian time zones", () => {
  // 13:30 UTC on 10 November is 00:30 on the 11th in Sydney, 23:30 on the 10th in Brisbane.
  const instant = new Date("2026-11-10T13:30:00Z");

  it("rolls the day over at local midnight, not at UTC midnight", () => {
    inZone("Australia/Sydney", () => expect(localDateKey(instant)).toBe("2026-11-11"));
    inZone("Australia/Melbourne", () => expect(localDateKey(instant)).toBe("2026-11-11"));
    inZone("Australia/Brisbane", () => expect(localDateKey(instant)).toBe("2026-11-10"));
    inZone("Australia/Perth", () => expect(localDateKey(instant)).toBe("2026-11-10"));
  });

  it("steps one day at a time across Sydney's daylight saving changes", () => {
    inZone("Australia/Sydney", () => {
      expect(shiftDateKey("2026-10-03", 1)).toBe("2026-10-04");
      expect(shiftDateKey("2026-10-03", 2)).toBe("2026-10-05");
      expect(shiftDateKey("2027-04-03", 1)).toBe("2027-04-04");
      expect(shiftDateKey("2027-04-03", 2)).toBe("2027-04-05");
      expect(shiftDateKey("2027-04-05", -2)).toBe("2027-04-03");
    });
  });

  it("runs weeks Monday to Sunday and months by calendar", () => {
    inZone("Australia/Sydney", () => {
      expect(periodRange("week", "2026-11-11")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
      expect(periodRange("week", "2026-11-15")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
      expect(periodRange("month", "2026-11-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
      expect(periodRange("week", "2026-10-04")).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    });
  });
});
