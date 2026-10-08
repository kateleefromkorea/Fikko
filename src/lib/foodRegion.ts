// Which regional food databases (regional_foods.source, migration 024) are the
// member's own, so their local foods rank above USDA's in search. Worked out
// from the device's time zone, so nothing is asked or stored.

const SOURCES_BY_COUNTRY: Record<string, string[]> = {
  AU: ["afcd"],
  KR: ["mfds", "rda"],
  SG: ["hpb"],
};

/** Short country label for a regional source, shown beside its foods. */
export const SOURCE_COUNTRY: Record<string, string> = { afcd: "AU", mfds: "KR", rda: "KR", hpb: "SG" };

function homeCountry(): string | null {
  let zone = "";
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""; } catch { return null; }
  if (zone.startsWith("Australia/")) return "AU";
  if (zone === "Asia/Seoul") return "KR";
  if (zone === "Asia/Singapore") return "SG";
  return null;
}

/** The regional sources local to this member, if any. */
export function homeSources(): Set<string> {
  const country = homeCountry();
  return new Set(country ? SOURCES_BY_COUNTRY[country] : []);
}
