import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { assertFetchable, FetchError, isBlockedAddress, parseRobots, robotsAllows, safeFetch } from "./safeFetch";

describe("isBlockedAddress", () => {
  test.each([
    "127.0.0.1", "127.255.0.9", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
    "::ffff:7f00:1", "64:ff9b::a00:1", "2002:a00:1::", "2001:db8::1", "2001:0:4136:e378::1",
    "[::1]", "fe80::1%en0", "not-an-ip", "",
  ])("blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));

  test.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "104.16.0.1", "2606:4700:4700::1111", "2a00:1450:4001::200e"])(
    "allows %s",
    (ip) => expect(isBlockedAddress(ip)).toBe(false),
  );
});

describe("assertFetchable", () => {
  test.each([
    "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.5/admin",
    "http://localhost/", "http://api.localhost/", "http://printer.local/", "http://db.internal/",
    "https://example.com:8080/", "https://example.com:22/", "ftp://example.com/", "https://a:b@example.com/",
  ])("refuses %s", (u) => {
    expect(() => assertFetchable(new URL(u))).toThrow(FetchError);
  });

  test.each(["https://example.com/", "http://example.com:80/x", "https://example.com:443/x", "https://8.8.8.8/"])("accepts %s", (u) => {
    expect(() => assertFetchable(new URL(u))).not.toThrow();
  });
});

describe("safeFetch", () => {
  // A local server stands in for a hostile page: requests to it must fail
  // because it resolves to a loopback address, however it's reached.
  let server: http.Server;
  let port: number;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/redirect") {
        res.writeHead(302, { Location: "http://127.0.0.1/secret" });
        return res.end();
      }
      res.end("<html>secret</html>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const opts = { maxBytes: 1024, timeoutMs: 2000, accept: "text/html" };

  test("won't connect to a name that resolves to loopback", async () => {
    await expect(safeFetch(new URL("http://localtest.me/"), opts)).rejects.toMatchObject({ reason: expect.stringMatching(/blocked|network/) });
  });

  test("won't connect to a loopback IP, even on a standard port", async () => {
    await expect(safeFetch(new URL("http://127.0.0.1/"), opts)).rejects.toMatchObject({ reason: "blocked" });
  });

  test("refuses a non-standard port before connecting", async () => {
    await expect(safeFetch(new URL(`http://127.0.0.1:${port}/`), opts)).rejects.toMatchObject({ reason: "blocked" });
  });
});

describe("robots.txt", () => {
  const txt = `
# comments are ignored
User-agent: *
Disallow: /private/
Allow: /private/recipes/
Disallow: /*.pdf$

User-agent: BadBot
Disallow: /
`;

  test("follows the * group, longest rule winning", () => {
    const rules = parseRobots(txt);
    expect(robotsAllows(rules, "/recipes/curry")).toBe(true);
    expect(robotsAllows(rules, "/private/notes")).toBe(false);
    expect(robotsAllows(rules, "/private/recipes/curry")).toBe(true);
    expect(robotsAllows(rules, "/files/menu.pdf")).toBe(false);
    expect(robotsAllows(rules, "/files/menu.pdf?x=1")).toBe(true);
  });

  test("uses a group naming us instead of *", () => {
    const rules = parseRobots(`User-agent: *\nDisallow: /\n\nUser-agent: FikkoBot\nAllow: /`);
    expect(robotsAllows(rules, "/recipe")).toBe(true);
  });

  test("a site that blocks everyone blocks us", () => {
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /"), "/recipe")).toBe(false);
  });

  test("an empty or missing robots.txt allows everything", () => {
    expect(robotsAllows(parseRobots(""), "/anything")).toBe(true);
  });
});
