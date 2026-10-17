import { describe, expect, it } from "vitest";
import { decide, localNow, type Candidate } from "./reminders.js";

// Australia has three standard time zones and only some states use daylight saving.
// In November 2026: Sydney and Melbourne UTC+11, Adelaide UTC+10:30, Brisbane UTC+10
// (no daylight saving), Perth UTC+8 (no daylight saving).
const SYDNEY = "Australia/Sydney";
const MELBOURNE = "Australia/Melbourne";
const ADELAIDE = "Australia/Adelaide";
const BRISBANE = "Australia/Brisbane";
const PERTH = "Australia/Perth";

describe("localNow in Australian time zones", () => {
  // 13:30 UTC on 10 November is half past midnight on the 11th in Sydney.
  const instant = new Date("2026-11-10T13:30:00Z");

  it.each([
    [SYDNEY, "2026-11-11", 0],
    [MELBOURNE, "2026-11-11", 0],
    [ADELAIDE, "2026-11-11", 0],
    [BRISBANE, "2026-11-10", 23],
    [PERTH, "2026-11-10", 21],
  ])("%s", (zone, date, hour) => {
    const local = localNow(instant, zone);
    expect(local.date).toBe(date);
    expect(local.hour).toBe(hour);
  });

  it("gives Sydney a Wednesday and Brisbane a Tuesday for that instant", () => {
    expect(localNow(instant, SYDNEY).weekday).toBe(3);
    expect(localNow(instant, BRISBANE).weekday).toBe(2);
  });

  it("skips the missing hour when Sydney's daylight saving starts (4 October 2026)", () => {
    expect(localNow(new Date("2026-10-03T15:59:00Z"), SYDNEY)).toMatchObject({ date: "2026-10-04", hour: 1 });
    expect(localNow(new Date("2026-10-03T16:00:00Z"), SYDNEY)).toMatchObject({ date: "2026-10-04", hour: 3 });
  });

  it("repeats an hour when it ends (4 April 2027) without changing the date", () => {
    expect(localNow(new Date("2027-04-03T15:30:00Z"), SYDNEY)).toMatchObject({ date: "2027-04-04", hour: 2 });
    expect(localNow(new Date("2027-04-03T16:30:00Z"), SYDNEY)).toMatchObject({ date: "2027-04-04", hour: 2 });
  });

  it("falls back to UTC for an unknown zone instead of throwing", () => {
    expect(localNow(instant, "Not/AZone")).toMatchObject({ date: "2026-11-10", hour: 13 });
  });
});

const member = (over: Partial<Candidate>): Candidate => ({
  frequency: "daily",
  send_hour: 19,
  time_zone: SYDNEY,
  last_sent_on: null,
  signed_up: "2026-11-08",
  logged_days: [],
  ...over,
});

describe("reminders at 7 pm local time", () => {
  // 08:00 UTC is 19:00 in Sydney and 16:00 in Perth; 11:00 UTC is 19:00 in Perth.
  const sydney7pm = new Date("2026-11-10T08:00:00Z");
  const perth7pm = new Date("2026-11-10T11:00:00Z");

  it("sends to a Sydney member at their 7 pm and to a Perth member at theirs, not the other way round", () => {
    expect(decide(member({}), sydney7pm)?.kind).toBe("nudge");
    expect(decide(member({ time_zone: PERTH }), sydney7pm)).toBeNull();
    expect(decide(member({ time_zone: PERTH }), perth7pm)?.kind).toBe("nudge");
    expect(decide(member({}), perth7pm)).toBeNull();
  });

  it("uses the member's own date for 'already logged today'", () => {
    // Brisbane 23:30 on the 10th. A log on the 11th (Sydney's date) isn't a log today.
    const late = new Date("2026-11-10T13:30:00Z");
    const brisbane = member({ time_zone: BRISBANE, send_hour: 23, logged_days: ["2026-11-10"] });
    expect(decide(brisbane, late)).toBeNull();
    expect(decide({ ...brisbane, logged_days: ["2026-11-09"] }, late)?.kind).toBe("nudge");
  });

  it("never sends twice on the same local date", () => {
    expect(decide(member({ last_sent_on: "2026-11-10" }), sydney7pm)).toBeNull();
    expect(decide(member({ last_sent_on: "2026-11-09" }), sydney7pm)?.kind).toBe("nudge");
  });

  it("holds the weekly summary for Sunday in the member's zone, even when it's still Saturday in UTC", () => {
    // 21:00 UTC on Saturday 14 November is 08:00 Sunday 15 November in Sydney.
    const sundayMorning = new Date("2026-11-14T21:00:00Z");
    const weekly = member({ frequency: "weekly", send_hour: 8, logged_days: ["2026-11-13"] });
    expect(decide(weekly, sundayMorning)).toMatchObject({ kind: "weekly-summary", localDate: "2026-11-15" });
    expect(decide({ ...weekly, time_zone: PERTH, send_hour: 5 }, sundayMorning)).toMatchObject({ kind: "weekly-summary", localDate: "2026-11-15" });
    expect(decide({ ...weekly, time_zone: "America/Los_Angeles", send_hour: 13 }, sundayMorning)).toBeNull();
  });

  it("skips weekday reminders on Saturday and Sunday in the member's zone", () => {
    // Saturday 14 November, 19:00 in Sydney (08:00 UTC).
    const saturday = new Date("2026-11-14T08:00:00Z");
    expect(decide(member({ frequency: "weekdays", logged_days: ["2026-11-13"] }), saturday)).toBeNull();
    expect(decide(member({ frequency: "daily", logged_days: ["2026-11-13"] }), saturday)?.kind).toBe("nudge");
  });
});
