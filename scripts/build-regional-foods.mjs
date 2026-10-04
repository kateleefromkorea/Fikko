#!/usr/bin/env node
// Turns a national food composition database into a CSV for the regional_foods
// table (migration 024), which the meal log's food search reads.
//
//   node scripts/build-regional-foods.mjs afcd <folder> [--out out/afcd.csv]
//
// afcd: Australia's AFCD. <folder> holds the files downloaded from
//   https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/data-files
//   (Excel or CSV): the "Food details" file and the "Nutrient profiles" file.
//
// The files' exact column names aren't published, so columns are found by name
// pattern, and the script prints which ones it picked. Check that list before
// importing. If a pattern misses, it stops and shows the headers it saw.
//
// Then, in Supabase: Table Editor → regional_foods → Insert → Import data from CSV.
// To replace an earlier import, delete that source's rows first:
//   delete from public.regional_foods where source = 'afcd';

import fs from "node:fs";
import path from "node:path";
import { readSheet } from "read-excel-file/node";

const KJ_PER_KCAL = 4.184;
const COLUMNS = ["source", "source_id", "name", "name_local", "category", "calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g"];

// ── Reading files ──────────────────────────────────────────────────────────

/** A small CSV reader: quoted fields, doubled quotes, and newlines inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

async function readRows(file) {
  if (/\.csv$/i.test(file)) return parseCsv(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  return readSheet(file);
}

const clean = (v) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());

/** Rows as objects keyed by header. The header is the first row near the top with several text cells. */
async function readTable(file) {
  const rows = await readRows(file);
  const at = rows.slice(0, 25).findIndex((r) => r.filter((c) => /[a-z]/i.test(clean(c))).length >= 3);
  if (at < 0) throw new Error(`No header row found in ${path.basename(file)}`);
  const headers = rows[at].map(clean);
  const records = rows.slice(at + 1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
  return { headers, records, file: path.basename(file) };
}

/** The first header that matches the pattern, preferring earlier patterns. */
function pick(headers, patterns, label, table) {
  for (const p of patterns) {
    const h = headers.find((x) => p.test(x.toLowerCase()));
    if (h) return h;
  }
  throw new Error(`Couldn't find the ${label} column in ${table}.\nHeaders seen:\n  ${headers.join("\n  ")}`);
}
const pickOptional = (headers, patterns) => patterns.map((p) => headers.find((x) => p.test(x.toLowerCase()))).find(Boolean) ?? null;

/** A number from a cell. "<0.1", "n/a", "-" and blanks are treated as missing, except "<" values which count as 0. */
function num(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = clean(v).replace(/,/g, "");
  if (/^<\s*[\d.]+$/.test(s)) return 0;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}
const r1 = (n) => Math.round(n * 10) / 10;
const inRange = (n, max) => (n != null && n >= 0 && n <= max ? r1(n) : null);

// ── Australia: AFCD ────────────────────────────────────────────────────────

async function buildAfcd(folder) {
  const files = fs.readdirSync(folder).filter((f) => /\.(xlsx|csv)$/i.test(f) && !f.startsWith("~$"));
  const find = (re, what) => {
    const f = files.find((x) => re.test(x));
    if (!f) throw new Error(`No ${what} file in ${folder}. Files there: ${files.join(", ") || "(none)"}`);
    return path.join(folder, f);
  };
  const details = await readTable(find(/food.?details?/i, "food details"));
  const profiles = await readTable(find(/nutrient.?profiles?/i, "nutrient profiles"));

  // Food details: id, name, group.
  const dKey = pick(details.headers, [/public food key/, /food (id|key)/, /^(id|key)$/], "food id", details.file);
  const dName = pick(details.headers, [/^food name/, /^name$/, /name/, /description/], "food name", details.file);
  const dGroup = pickOptional(details.headers, [/^classification\b/, /food group/, /group/]);
  // Nutrient profiles: the same id, then one column per nutrient.
  const pKey = pick(profiles.headers, [/public food key/, /food (id|key)/, /^(id|key)$/], "food id", profiles.file);
  const h = profiles.headers;
  const energy = pick(h, [/^energy.*dietary fibre.*kj/, /^energy.*kj/, /^energy.*kcal/, /^energy/, /^(calories|kcal)/], "energy", profiles.file);
  const protein = pick(h, [/^protein/], "protein", profiles.file);
  const fat = pick(h, [/^(total )?fat, total/, /^total fat/, /^fat(?!ty)(?!.*(saturated|mono|poly|trans))/], "total fat", profiles.file);
  const carbs = pick(h, [/available carbohydrate.*without sugar alcohol/, /available carbohydrate/, /^carbohydrate/], "carbohydrate", profiles.file);
  const energyIsKj = /kj/i.test(energy) || !/kcal|cal/i.test(energy);

  console.log("Columns used");
  console.log(`  ${details.file}: id = "${dKey}", name = "${dName}", group = ${dGroup ? `"${dGroup}"` : "(none)"}`);
  console.log(`  ${profiles.file}: id = "${pKey}"`);
  console.log(`    energy  = "${energy}" (${energyIsKj ? "kJ, converted to kcal" : "kcal"})`);
  console.log(`    protein = "${protein}"\n    fat     = "${fat}"\n    carbs   = "${carbs}"`);

  const byKey = new Map();
  for (const r of profiles.records) byKey.set(clean(r[pKey]), r);

  const out = [];
  const skipped = { noName: 0, noProfile: 0, noEnergy: 0, duplicate: 0 };
  const seen = new Set();
  for (const d of details.records) {
    const id = clean(d[dKey]);
    const name = clean(d[dName]);
    if (!id || !name) { skipped.noName++; continue; }
    if (seen.has(id)) { skipped.duplicate++; continue; }
    const p = byKey.get(id);
    if (!p) { skipped.noProfile++; continue; }
    const e = num(p[energy]);
    const kcal = e == null ? null : inRange(energyIsKj ? e / KJ_PER_KCAL : e, 900);
    if (kcal == null) { skipped.noEnergy++; continue; }
    seen.add(id);
    out.push({
      source: "afcd", source_id: id, name, name_local: "", category: dGroup ? clean(d[dGroup]) : "",
      calories_per_100g: kcal,
      protein_per_100g: inRange(num(p[protein]), 100) ?? "",
      carbs_per_100g: inRange(num(p[carbs]), 100) ?? "",
      fat_per_100g: inRange(num(p[fat]), 100) ?? "",
    });
  }
  return { rows: out, skipped };
}

// ── Output ─────────────────────────────────────────────────────────────────

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";

const SOURCES = { afcd: buildAfcd };

async function main() {
  const [source, folder, ...rest] = process.argv.slice(2);
  if (!SOURCES[source] || !folder) {
    console.error(`Usage: node scripts/build-regional-foods.mjs <${Object.keys(SOURCES).join("|")}> <folder> [--out file.csv]`);
    process.exit(1);
  }
  const outIdx = rest.indexOf("--out");
  const outFile = outIdx >= 0 ? rest[outIdx + 1] : path.join("out", `${source}.csv`);

  const { rows, skipped } = await SOURCES[source](folder);
  if (!rows.length) throw new Error("No foods were produced. Check the columns above.");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, toCsv(rows));

  console.log(`\nWrote ${rows.length} foods to ${outFile}`);
  const skips = Object.entries(skipped).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
  if (skips.length) console.log(`Skipped: ${skips.join(", ")}`);
  console.log("\nA few rows to check against the source files:");
  for (const r of rows.slice(0, 5)) {
    const g = (v) => (v === "" ? "?" : v);
    console.log(`  ${r.name}: ${r.calories_per_100g} kcal, protein ${g(r.protein_per_100g)} g, carbs ${g(r.carbs_per_100g)} g, fat ${g(r.fat_per_100g)} g per 100 g`);
  }
}

main().catch((err) => { console.error(`\n${err.message}`); process.exit(1); });
