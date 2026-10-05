import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { ExportRange } from "./account";
import { describeRange } from "./dates";

// Turns a full data export into a readable PDF report: the profile as a
// label/value list, then one table per kind of data. The JSON export stays the
// complete, machine-readable copy; this is the one people can open and read.

type Row = Record<string, unknown>;

// Section titles, in the order they appear. Anything not listed falls back to
// a title made from the table name.
const SECTION_TITLES: Record<string, string> = {
  habit_entries: "Habit log",
  custom_habits: "Custom habits",
  custom_habit_entries: "Custom habit log",
  biometric_entries: "Synced device readings",
  coach_messages: "AI coach conversation",
  food_log_items: "Food log",
  custom_foods: "Saved foods",
  saved_meals: "Saved meals",
  medications: "Medications",
  recipes: "Recipes you shared",
  recipe_saves: "Saved recipes",
  community_posts: "Community posts",
  community_comments: "Community comments",
  community_cheers: "Cheers you gave",
  points_events: "Points history",
};

// Internal identifiers mean nothing to a reader, so they stay in the JSON only.
const isInternalColumn = (key: string) => key === "id" || key === "user_id" || key.endsWith("_id");

const MAX_CELL = 240;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const titleCase = (key: string) =>
  key.replace(/_/g, " ").replace(/\b\w/, (c) => c.toUpperCase());

function formatValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  if (ISO_DATETIME.test(text)) {
    const d = new Date(text);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
  return text.length > MAX_CELL ? text.slice(0, MAX_CELL) + "…" : text;
}

/** Columns worth showing for a table: every key any row has, minus internal ids. */
function visibleColumns(rows: Row[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) if (!isInternalColumn(key)) keys.add(key);
  return [...keys];
}

export function buildPdf(tables: Record<string, Row[]>, exportedAt: Date, range: ExportRange | null = null): jsPDF {
  // Landscape gives wide tables like the food log room to breathe.
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margin = 40;
  // Evergreen (#003A35): the deep green, readable as text on white.
  const accent: [number, number, number] = [0, 58, 53];
  let y = margin;

  const nextY = () => (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  const heading = (text: string) => {
    if (y > doc.internal.pageSize.getHeight() - 100) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(20);
    doc.text(text, margin, y);
    y += 8;
  };

  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(...accent);
  doc.text("Fikko data export", margin, y + 10);
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(40);
  doc.text(describeRange(range), margin, y + 30);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(110);
  doc.text(`Exported ${exportedAt.toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })}`, margin, y + 46);
  doc.text(
    range
      ? "Logs and activity are from this period only. Your profile, habits, medications and saved foods are included in full."
      : "Internal IDs are left out here. Choose the JSON export for a complete, machine-readable copy.",
    margin,
    y + 60,
  );
  y += 88;

  // Profile: one row, so show it as label/value pairs rather than a wide table.
  const profile = tables.profiles?.[0];
  heading("Profile");
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 160, textColor: 90 } },
    body: profile
      ? visibleColumns([profile]).map((key) => [titleCase(key), formatValue(profile[key])])
      : [["No profile saved", ""]],
  });
  y = nextY() + 28;

  const order = [
    ...Object.keys(SECTION_TITLES),
    ...Object.keys(tables).filter((t) => t !== "profiles" && !(t in SECTION_TITLES)),
  ];
  for (const table of order) {
    const rows = tables[table];
    if (!rows) continue;
    heading(`${SECTION_TITLES[table] ?? titleCase(table)} (${rows.length})`);
    if (rows.length === 0) {
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(130);
      doc.text("No entries.", margin, y + 10);
      y += 36;
      continue;
    }
    const columns = visibleColumns(rows);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [columns.map(titleCase)],
      body: rows.map((row) => columns.map((key) => formatValue(row[key]))),
      styles: { fontSize: 7.5, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: accent, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 248, 246] },
    });
    y = nextY() + 28;
  }

  // Page numbers last, once the total is known.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(150);
    const { width, height } = doc.internal.pageSize;
    doc.text(`Page ${i} of ${pages}`, width - margin, height - 20, { align: "right" });
  }
  return doc;
}
