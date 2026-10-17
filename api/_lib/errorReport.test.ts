import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("scrub", () => {
  it("removes emails, ids, tokens and keys", async () => {
    const { scrub } = await import("./errorReport.js");
    const out = scrub("failed for kate@example.com user 3f2b8c1e-1a2b-4c3d-9e8f-0a1b2c3d4e5f jwt eyJhbGciOi.eyJzdWIiOi.abc123 key pri_01m548pt3xg5q2kr3p7gsa1ew1");
    expect(out).not.toMatch(/example\.com|3f2b8c1e|eyJhbGci|pri_01m5/);
    expect(out).toContain("[email]");
    expect(out).toContain("[id]");
    expect(out).toContain("[token]");
    expect(out).toContain("[key]");
  });

  it("trims long text", async () => {
    const { scrub } = await import("./errorReport.js");
    expect(scrub("x".repeat(1000)).length).toBe(300);
  });
});

describe("reportServerError", () => {
  it("does nothing without a DSN", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { reportServerError } = await import("./errorReport.js");
    await reportServerError(new Error("boom"), "/api/x");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a scrubbed event to the project's envelope endpoint, once per minute per error", async () => {
    vi.stubEnv("SENTRY_DSN", "https://abc123@o1.ingest.sentry.io/456");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const { reportServerError } = await import("./errorReport.js");
    await reportServerError(new Error("bad row for kate@example.com"), "/api/email");
    await reportServerError(new Error("bad row for kate@example.com"), "/api/email");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://o1.ingest.sentry.io/api/456/envelope/?sentry_key=abc123&sentry_version=7");
    expect(init.body).toContain("[email]");
    expect(init.body).not.toContain("example.com");
    expect(init.body).toContain("/api/email");
  });

  it("never throws when Sentry is unreachable", async () => {
    vi.stubEnv("SENTRY_DSN", "https://abc123@o1.ingest.sentry.io/456");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { reportServerError } = await import("./errorReport.js");
    await expect(reportServerError(new Error("x"), "/api/y")).resolves.toBeUndefined();
  });
});
