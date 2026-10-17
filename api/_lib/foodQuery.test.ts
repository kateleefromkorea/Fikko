import { describe, expect, it } from "vitest";
import { matchTier, queryVariants } from "./foodQuery.js";

describe("queryVariants", () => {
  it("keeps the query first and adds the Australian name", () => {
    expect(queryVariants("yogurt")).toEqual(["yogurt", "yoghurt"]);
    expect(queryVariants("Greek  Yogurt")).toEqual(["greek yogurt", "greek yoghurt"]);
    expect(queryVariants("bell pepper")).toEqual(["bell pepper", "capsicum"]);
    expect(queryVariants("shrimp")).toEqual(["shrimp", "prawn"]);
    expect(queryVariants("weetbix")).toEqual(["weetbix", "weet-bix"]);
    expect(queryVariants("weet bix")).toEqual(["weet bix", "weet-bix"]);
    expect(queryVariants("scallions")).toEqual(["scallions", "spring onion"]);
  });

  it("returns just the query when nothing needs rewriting", () => {
    expect(queryVariants("lamington")).toEqual(["lamington"]);
    expect(queryVariants("  Flat   White ")).toEqual(["flat white"]);
  });

  it("matches whole words only", () => {
    expect(queryVariants("avocado")).toEqual(["avocado"]);
    expect(queryVariants("cookiesheet")).toEqual(["cookiesheet"]);
  });

  it("caps the number of searches", () => {
    expect(queryVariants("yogurt shrimp cookies", 2)).toHaveLength(2);
    expect(queryVariants("yogurt shrimp cookies").length).toBeLessThanOrEqual(3);
  });
});

describe("matchTier", () => {
  it("ranks an exact food, then a start match, then a phrase, then any word match", () => {
    expect(matchTier("Rockmelon, peeled, raw", null, "rockmelon")).toBe(0);
    expect(matchTier("Rockmelon juice, bottled", null, "rockmelon")).toBe(1);
    expect(matchTier("Coffee, flat white/latte/cappuccino, from ground coffee beans", null, "flat white")).toBe(2);
    expect(matchTier("Bread, flat (pita or Lebanese), white, commercial", null, "flat white")).toBe(3);
  });

  it("treats a matching local name as exact", () => {
    expect(matchTier("Kimchi", "김치", "김치")).toBe(0);
  });
});
