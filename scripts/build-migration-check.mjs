// Builds docs/launch/check-migrations.sql from src/db/schema.sql and every
// file in src/db/migrations: one expected row per table, column, view, index,
// function, trigger and policy those files create, minus anything a later
// file drops. Run with `node scripts/build-migration-check.mjs`, then paste
// the output file into the Supabase SQL editor (read-only).

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dbDir = join(root, "src/db");
const files = ["schema.sql", ...readdirSync(join(dbDir, "migrations")).filter((f) => f.endsWith(".sql")).sort().map((f) => `migrations/${f}`)];

const ident = String.raw`(?:"[^"]+"|[\w$]+)`;
const qualified = String.raw`(${ident}(?:\.${ident})?)`;
const unq = (s) => s.replace(/"/g, "");
const split = (name, defaultSchema = "public") => {
  const parts = unq(name).split(".");
  return parts.length === 2 ? [parts[0], parts[1]] : [defaultSchema, parts[0]];
};

/** Removes comments and dollar-quoted bodies so their text isn't parsed as DDL. */
const clean = (sql) =>
  sql
    .replace(/\$([\w]*)\$[\s\S]*?\$\1\$/g, "''")
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

/** Top-level comma split of a create-table body. */
function splitColumns(body) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

const expected = new Map(); // key -> row
const key = (kind, sch, tbl, name) => `${kind}|${sch}|${tbl ?? ""}|${name}`;
const add = (file, kind, sch, tbl, name) => { const k = key(kind, sch, tbl, name); if (!expected.has(k)) expected.set(k, { file, kind, sch, tbl, name }); };
const drop = (kind, sch, tbl, name) => {
  for (const [k, row] of expected) {
    if (row.kind === kind && row.sch === sch && row.name === name && (tbl === undefined || row.tbl === tbl)) expected.delete(k);
    if (kind === "table" && row.sch === sch && row.tbl === name) expected.delete(k);
  }
};

for (const file of files) {
  const label = file.replace("migrations/", "");
  const sql = clean(readFileSync(join(dbDir, file), "utf8"));
  const statements = sql.split(/;\s*(?=\n|$)/);
  for (const raw of statements) {
    const st = raw.trim().replace(/\s+/g, " ");
    let m;
    if ((m = st.match(new RegExp(String.raw`^create table (?:if not exists )?${qualified} ?\(([\s\S]*)\)`, "i")))) {
      const [sch, tbl] = split(m[1]);
      add(label, "table", sch, null, tbl);
      for (const col of splitColumns(m[2])) {
        if (/^(constraint|primary key|unique|foreign key|check|exclude)\b/i.test(col)) continue;
        const name = col.match(new RegExp(`^(${ident})`))?.[1];
        if (name) add(label, "column", sch, tbl, unq(name));
      }
    } else if ((m = st.match(new RegExp(String.raw`^alter table (?:if exists )?(?:only )?${qualified} (.*)$`, "i")))) {
      const [sch, tbl] = split(m[1]);
      for (const part of splitColumns(m[2])) {
        let c;
        if ((c = part.match(new RegExp(String.raw`^add column (?:if not exists )?(${ident})`, "i")))) add(label, "column", sch, tbl, unq(c[1]));
        else if ((c = part.match(new RegExp(String.raw`^drop column (?:if exists )?(${ident})`, "i")))) drop("column", sch, tbl, unq(c[1]));
        else if ((c = part.match(new RegExp(String.raw`^rename column (${ident}) to (${ident})`, "i")))) { drop("column", sch, tbl, unq(c[1])); add(label, "column", sch, tbl, unq(c[2])); }
      }
    } else if ((m = st.match(new RegExp(String.raw`^create (?:or replace )?function ${qualified}`, "i")))) {
      const [sch, name] = split(m[1]);
      add(label, "function", sch, null, name);
    } else if ((m = st.match(new RegExp(String.raw`^create (?:or replace )?(?:constraint )?trigger (${ident}) .*? on ${qualified}`, "i")))) {
      const [sch, tbl] = split(m[2]);
      add(label, "trigger", sch, tbl, unq(m[1]));
    } else if ((m = st.match(new RegExp(String.raw`^create (?:unique )?index (?:concurrently )?(?:if not exists )?(${ident}) on (?:only )?${qualified}`, "i")))) {
      const [sch] = split(m[2]);
      add(label, "index", sch, null, unq(m[1]));
    } else if ((m = st.match(new RegExp(String.raw`^create (?:or replace )?view ${qualified}`, "i")))) {
      const [sch, name] = split(m[1]);
      add(label, "view", sch, null, name);
    } else if ((m = st.match(new RegExp(String.raw`^create policy (${ident}) on ${qualified}`, "i")))) {
      const [sch, tbl] = split(m[2]);
      add(label, "policy", sch, tbl, unq(m[1]));
    } else if ((m = st.match(new RegExp(String.raw`^drop table (?:if exists )?${qualified}`, "i")))) {
      const [sch, name] = split(m[1]); drop("table", sch, undefined, name);
    } else if ((m = st.match(new RegExp(String.raw`^drop function (?:if exists )?${qualified}`, "i")))) {
      const [sch, name] = split(m[1]);
      // A drop followed by a re-create in the same file is common; only drop if nothing re-adds it later.
      drop("function", sch, undefined, name);
    } else if ((m = st.match(new RegExp(String.raw`^drop trigger (?:if exists )?(${ident}) on ${qualified}`, "i")))) {
      const [sch, tbl] = split(m[2]); drop("trigger", sch, tbl, unq(m[1]));
    } else if ((m = st.match(new RegExp(String.raw`^drop policy (?:if exists )?(${ident}) on ${qualified}`, "i")))) {
      const [sch, tbl] = split(m[2]); drop("policy", sch, tbl, unq(m[1]));
    } else if ((m = st.match(new RegExp(String.raw`^drop index (?:if exists )?${qualified}`, "i")))) {
      const [sch, name] = split(m[1]); drop("index", sch, undefined, name);
    } else if ((m = st.match(new RegExp(String.raw`^drop view (?:if exists )?${qualified}`, "i")))) {
      const [sch, name] = split(m[1]); drop("view", sch, undefined, name);
    }
  }
}

// Migrations that only rewrite an existing function or constraint can't be
// seen by name, so check for a phrase their new version contains.
const CONTENT_CHECKS = [
  { file: "041_food_macros_cost.sql", kind: "constraint text", sch: "public", tbl: "ai_costs", name: "ai_costs_feature_check", has: "food_macros" },
  { file: "045_founders_year_from_joining.sql", kind: "function text", sch: "public", tbl: null, name: "effective_plan", has: "claimed + interval '12 months'" },
];
for (const c of CONTENT_CHECKS) expected.set(key(c.kind, c.sch, c.tbl, c.name), c);

const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const rows = [...expected.values()].map((r) => `  (${q(r.file)}, ${q(r.kind)}, ${q(r.sch)}, ${q(r.tbl)}, ${q(r.name)}, ${q(r.has ?? null)})`);
const last = files.at(-1).replace("migrations/", "").slice(0, 3);
const today = new Date().toISOString().slice(0, 10);

const out = `-- Migration check: is everything from schema.sql and migrations 002–${last} in this database?
-- Generated ${today} by scripts/build-migration-check.mjs (${rows.length} checks).
-- Read-only. Returns one row per missing object, plus any public table
-- without row-level security. One row saying "All good" means nothing is missing.

with expected(file, kind, sch, tbl, name, has) as (values
${rows.join(",\n")}
),
missing as (
  select e.file, e.kind, coalesce(e.tbl || '.', '') || e.name as object
  from expected e
  where not case e.kind
    when 'table'    then to_regclass(format('%I.%I', e.sch, e.name)) is not null
    when 'view'     then to_regclass(format('%I.%I', e.sch, e.name)) is not null
    when 'index'    then to_regclass(format('%I.%I', e.sch, e.name)) is not null
    when 'column'   then exists (select 1 from information_schema.columns c
                                 where c.table_schema = e.sch and c.table_name = e.tbl and c.column_name = e.name)
    when 'function' then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                 where n.nspname = e.sch and p.proname = e.name)
    when 'trigger'  then exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                                 join pg_namespace n on n.oid = c.relnamespace
                                 where n.nspname = e.sch and c.relname = e.tbl and t.tgname = e.name)
    when 'policy'   then exists (select 1 from pg_policies p
                                 where p.schemaname = e.sch and p.tablename = e.tbl and p.policyname = e.name)
    when 'function text' then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                 where n.nspname = e.sch and p.proname = e.name and position(e.has in p.prosrc) > 0)
    when 'constraint text' then exists (select 1 from pg_constraint k join pg_class c on c.oid = k.conrelid
                                 join pg_namespace n on n.oid = c.relnamespace
                                 where n.nspname = e.sch and c.relname = e.tbl and k.conname = e.name
                                   and position(e.has in pg_get_constraintdef(k.oid)) > 0)
  end
  union all
  select '(security)', 'no row-level security', c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
)
select * from missing
union all
select 'All good', (select count(*) from expected)::text || ' objects checked', 'nothing missing'
where not exists (select 1 from missing)
order by 1, 2, 3;
`;
writeFileSync(join(root, "docs/launch/check-migrations.sql"), out);
console.log(`Wrote docs/launch/check-migrations.sql: ${rows.length} objects from ${files.length} files.`);
