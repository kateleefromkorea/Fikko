import { describe, expect, test } from "vitest";
import { InvalidUrlError, normalizeUrl, sourceKey, unsupportedSource } from "./url";

describe("normalizeUrl", () => {
  test("strips tracking parameters and the fragment, keeps real ones sorted", () => {
    const url = normalizeUrl("https://www.example.com/recipes/curry/?utm_source=ig&utm_medium=social&fbclid=abc&p=2&a=1#comments");
    expect(url.toString()).toBe("https://www.example.com/recipes/curry/?a=1&p=2");
  });

  test("adds https:// when the scheme is missing", () => {
    expect(normalizeUrl("example.com/chicken-soup").toString()).toBe("https://example.com/chicken-soup");
  });

  test("finds the link inside pasted share text", () => {
    const url = normalizeUrl("Try this! https://cookpad.com/jp/recipes/123?ref=share. So good");
    expect(url.toString()).toBe("https://cookpad.com/jp/recipes/123");
  });

  test("keeps non-ASCII paths and hosts usable", () => {
    const url = normalizeUrl("https://예시.kr/레시피");
    expect(url.hostname).toMatch(/^xn--.+\.kr$/);
    expect(decodeURIComponent(url.pathname)).toBe("/레시피");
  });

  test.each([
    ["", "Paste a link"],
    ["not a link", "doesn't look like a web link"],
    ["ftp://example.com/recipe", "Only web links"],
    ["javascript:alert(1)", "Only web links"],
    ["https://user:pass@example.com/", "username or password"],
    ["https://intranet/", "missing its website"],
  ])("rejects %j", (input, message) => {
    expect(() => normalizeUrl(input)).toThrow(InvalidUrlError);
    expect(() => normalizeUrl(input)).toThrow(message);
  });
});

describe("sourceKey", () => {
  test("is the same however the page was linked", () => {
    const keys = [
      "https://www.example.com/recipes/curry/",
      "http://example.com/recipes/curry",
      "https://EXAMPLE.com/recipes/curry?utm_campaign=x#step-3",
    ].map((u) => sourceKey(normalizeUrl(u)));
    expect(new Set(keys)).toEqual(new Set(["example.com/recipes/curry"]));
  });

  test("keeps query parameters that pick the page", () => {
    expect(sourceKey(normalizeUrl("https://example.com/?p=123"))).toBe("example.com?p=123");
    expect(sourceKey(normalizeUrl("https://example.com/?p=124"))).not.toBe(sourceKey(normalizeUrl("https://example.com/?p=123")));
  });

  test("keeps path case, which some sites use", () => {
    expect(sourceKey(normalizeUrl("https://example.com/Recipe/AbC"))).toBe("example.com/Recipe/AbC");
  });
});

describe("unsupportedSource", () => {
  test.each([
    ["https://www.instagram.com/p/abc/", "Instagram"],
    ["https://vm.tiktok.com/xyz", "TikTok"],
    ["https://youtu.be/abc", "YouTube"],
    ["https://m.facebook.com/watch", "Facebook"],
    ["https://x.com/someone/status/1", "X and Threads"],
    ["https://pin.it/abc", "Pinterest"],
    ["https://www.pinterest.co.uk/pin/1", "Pinterest"],
  ])("%s is not supported yet", (u, site) => expect(unsupportedSource(new URL(u))).toContain(site));

  test.each(["https://www.bbcgoodfood.com/recipes/x", "https://notinstagram.com/r", "https://cookpad.com/jp/recipes/1"])("%s is fine", (u) =>
    expect(unsupportedSource(new URL(u))).toBeNull(),
  );
});
