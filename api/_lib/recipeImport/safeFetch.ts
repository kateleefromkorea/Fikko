// Fetching pages members point us at, safely. A pasted link is untrusted: it
// could point at our own infrastructure (localhost, the cloud metadata
// address, a private network) or redirect there. So:
//   • http and https only, on the standard ports;
//   • every address a host name resolves to is checked when the connection is
//     made (the `lookup` hook below), so a DNS answer can't be swapped between
//     a check and the request; literal IP hosts are checked up front;
//   • redirects are followed by hand, at most MAX_REDIRECTS, each one checked again;
//   • every request has a deadline and a size cap, after decompression too.
// We say who we are in the User-Agent and never send cookies or credentials.

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";

export const USER_AGENT = "FikkoBot/1.0 (+https://fikko.io; imports a recipe a Fikko member asked for)";
const MAX_REDIRECTS = 5;

export type FetchFailure =
  | "blocked" | "timeout" | "too_large" | "too_many_redirects" | "http_error" | "network" | "unsupported_type";

export class FetchError extends Error {
  constructor(public reason: FetchFailure, message: string, public status?: number) { super(message); }
}

// ── Which addresses we refuse to connect to ────────────────────────────────

const BLOCKED_V4 = new net.BlockList();
for (const [net4, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) BLOCKED_V4.addSubnet(net4, prefix, "ipv4");

// IPv6: only global unicast (2000::/3) is allowed at all, which already rules
// out loopback, link-local, unique-local, multicast and IPv4-mapped addresses.
// Inside it, block documentation, 6to4 and Teredo, which can wrap private IPv4.
const GLOBAL_V6 = new net.BlockList();
GLOBAL_V6.addSubnet("2000::", 3, "ipv6");
const BLOCKED_V6 = new net.BlockList();
for (const [net6, prefix] of [["2001:db8::", 32], ["2002::", 16], ["2001::", 32]] as const) BLOCKED_V6.addSubnet(net6, prefix, "ipv6");

/** True for any address that isn't a public internet address. Unparseable counts as blocked. */
export function isBlockedAddress(ip: string): boolean {
  const address = ip.replace(/^\[|\]$/g, "").split("%")[0];
  switch (net.isIP(address)) {
    case 4: return BLOCKED_V4.check(address, "ipv4");
    case 6: return !GLOBAL_V6.check(address, "ipv6") || BLOCKED_V6.check(address, "ipv6");
    default: return true;
  }
}

const BLOCKED_NAMES = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/i;

/** Throws FetchError("blocked") for any URL we won't request. */
export function assertFetchable(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchError("blocked", "Only web links can be imported.");
  if (url.username || url.password) throw new FetchError("blocked", "Links with login details can't be imported.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new FetchError("blocked", "That link uses an unusual port, so we can't open it.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_NAMES.test(host)) throw new FetchError("blocked", "That link points to a private network, so we can't open it.");
  if (net.isIP(host) && isBlockedAddress(host)) throw new FetchError("blocked", "That link points to a private network, so we can't open it.");
}

/** dns.lookup, refusing to hand back any address we wouldn't connect to. */
const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = addresses as unknown as dns.LookupAddress[];
    if (!list.length || list.some((a) => isBlockedAddress(a.address))) {
      const blocked = Object.assign(new Error("Blocked address"), { code: "EFIKKOBLOCKED" }) as NodeJS.ErrnoException;
      return callback(blocked, "", 4);
    }
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

// ── Fetching ───────────────────────────────────────────────────────────────

export interface FetchOptions {
  /** Largest body we'll read, after decompression. */
  maxBytes: number;
  /** Deadline for the whole fetch, redirects included. */
  timeoutMs: number;
  accept: string;
  /** Content types we'll read; anything else fails with "unsupported_type". */
  allowTypes?: RegExp;
}

export interface FetchResult {
  /** Where we ended up after redirects. */
  url: URL;
  status: number;
  contentType: string;
  body: Buffer;
}

function decoded(res: http.IncomingMessage): Readable {
  switch ((res.headers["content-encoding"] ?? "").toLowerCase().trim()) {
    case "gzip": case "x-gzip": return res.pipe(zlib.createGunzip());
    case "deflate": return res.pipe(zlib.createInflate());
    case "br": return res.pipe(zlib.createBrotliDecompress());
    default: return res;
  }
}

type Hop = { redirect: URL } | { result: FetchResult };

function requestOnce(url: URL, opts: FetchOptions, signal: AbortSignal): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url, {
      method: "GET",
      agent: false,
      lookup: guardedLookup,
      signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: opts.accept,
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "*",
      },
    });

    req.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EFIKKOBLOCKED") reject(new FetchError("blocked", "That link points to a private network, so we can't open it."));
      else if (err.name === "AbortError" || signal.aborted) reject(new FetchError("timeout", "The page took too long to respond."));
      else reject(new FetchError("network", "We couldn't reach that website. Check the link, or try again later."));
    });

    req.on("response", (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        res.resume();
        try {
          return resolve({ redirect: new URL(location, url) });
        } catch {
          return reject(new FetchError("network", "That website sent us somewhere we couldn't follow."));
        }
      }
      if (status < 200 || status >= 300) {
        res.resume();
        return reject(new FetchError("http_error", `The website answered with an error (${status}).`, status));
      }

      const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
      if (opts.allowTypes && !opts.allowTypes.test(contentType)) {
        res.resume();
        return reject(new FetchError("unsupported_type", "That link isn't a web page."));
      }
      const declared = Number(res.headers["content-length"] ?? 0);
      if (declared > opts.maxBytes && !res.headers["content-encoding"]) {
        res.destroy();
        return reject(new FetchError("too_large", "That page is too large to import."));
      }

      const chunks: Buffer[] = [];
      let size = 0;
      const stream = decoded(res);
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > opts.maxBytes) {
          stream.destroy();
          res.destroy();
          reject(new FetchError("too_large", "That page is too large to import."));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("error", () => reject(new FetchError("network", "We couldn't read that page.")));
      stream.on("end", () => resolve({ result: { url, status, contentType, body: Buffer.concat(chunks) } }));
    });

    req.end();
  });
}

/** GETs `input` under every rule above. Throws FetchError. */
export async function safeFetch(input: URL, opts: FetchOptions): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    let url = input;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      assertFetchable(url);
      const next = await requestOnce(url, opts, controller.signal);
      if ("result" in next) return next.result;
      url = next.redirect;
    }
    throw new FetchError("too_many_redirects", "That link redirects too many times.");
  } finally {
    clearTimeout(timer);
  }
}

/** Text of an HTML response in the right character set (Shift_JIS and EUC-KR pages still exist). */
export function decodeHtml(body: Buffer, contentType: string) {
  const fromHeader = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  const head = body.subarray(0, 4096).toString("latin1");
  const fromMeta = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  for (const label of [fromHeader, fromMeta, "utf-8"]) {
    if (!label) continue;
    try {
      return new TextDecoder(label.toLowerCase()).decode(body);
    } catch {
      // Unknown label: try the next one.
    }
  }
  return body.toString("utf8");
}

// ── robots.txt ─────────────────────────────────────────────────────────────
// A member asking for one page is closer to a browser than a crawler, but we
// still honour a site that asks bots to stay out. Unreachable or broken
// robots.txt means allowed, as the standard says (RFC 9309).

const robotsCache = new Map<string, { at: number; rules: RobotRule[] }>();
const ROBOTS_TTL_MS = 60 * 60 * 1000;

interface RobotRule { allow: boolean; path: string }

/** The rules that apply to us: our own group if the site has one, otherwise "*". */
export function parseRobots(text: string, agent = "fikkobot"): RobotRule[] {
  const groups: { agents: string[]; rules: RobotRule[] }[] = [];
  let current: { agents: string[]; rules: RobotRule[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const field = m[1].toLowerCase(), value = m[2].trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === "allow" || field === "disallow") && current) {
      if (value) current.rules.push({ allow: field === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules);
}

function ruleMatches(rule: string, path: string) {
  const anchored = rule.endsWith("$");
  const pattern = (anchored ? rule.slice(0, -1) : rule).split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

/** Longest matching rule wins; Allow wins a tie. */
export function robotsAllows(rules: RobotRule[], path: string) {
  let best: RobotRule | null = null;
  for (const rule of rules) {
    if (!ruleMatches(rule.path, path)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return !best || best.allow;
}

export async function allowedByRobots(url: URL): Promise<boolean> {
  const origin = url.origin;
  let entry = robotsCache.get(origin);
  if (!entry || Date.now() - entry.at > ROBOTS_TTL_MS) {
    let rules: RobotRule[] = [];
    try {
      const res = await safeFetch(new URL("/robots.txt", origin), { maxBytes: 512 * 1024, timeoutMs: 2500, accept: "text/plain" });
      rules = parseRobots(res.body.toString("utf8"));
    } catch {
      // No robots.txt, or it couldn't be read: nothing is disallowed.
    }
    entry = { at: Date.now(), rules };
    robotsCache.set(origin, entry);
  }
  return robotsAllows(entry.rules, `${url.pathname}${url.search}`);
}
