import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { Report, Summary } from "./report";

// Draws a deep-dive report (report.ts) as a readable, printable PDF: the
// numbers at a glance, highlights, patterns, small charts, weekdays against
// weekends, food and custom habits. Portrait A4, Fikko green.

const GREEN: [number, number, number] = [21, 121, 84];   // #157954
const INK: [number, number, number] = [0, 58, 53];       // #003A35
const MUTED = 110;
const BARS: Record<string, [number, number, number]> = {
  water: [61, 143, 219],    // #3D8FDB
  sleep: [99, 102, 241],
  mood: [26, 156, 140],     // #1A9C8C
  activity: [234, 140, 46],
};

const fmt = (v: number | null, digits = 1, unit = "") => (v == null ? "–" : `${digits ? Math.round(v * 10 ** digits) / 10 ** digits : Math.round(v).toLocaleString("en-US")}${unit}`);

/** "+0.4" or "-120", or blank when either side is missing or nothing changed. */
function change(now: number | null, before: number | null, digits = 1, higherIsBetter = true) {
  if (now == null || before == null) return { text: "", good: null as boolean | null };
  const diff = now - before;
  const shown = digits ? Math.round(diff * 10 ** digits) / 10 ** digits : Math.round(diff);
  if (shown === 0) return { text: "same", good: null };
  return { text: `${shown > 0 ? "+" : ""}${shown.toLocaleString("en-US")}`, good: shown > 0 === higherIsBetter };
}

function glanceRows(s: Summary, p: Summary | null, goals: Report["goals"]) {
  const pct = (x: number | null) => (x == null ? null : x * 100);
  const rows: [string, string, string, ReturnType<typeof change>][] = [
    ["Days logged", `${s.daysLogged} of ${s.days}`, p ? `${p.daysLogged} of ${p.days}` : "", change(s.daysLogged / s.days * 100, p ? p.daysLogged / p.days * 100 : null, 0)],
    ["Water, glasses a day", fmt(s.water), p ? fmt(p.water) : "", change(s.water, p?.water ?? null)],
    [`Days at your water goal (${goals.water})`, String(s.waterGoalDays), p ? String(p.waterGoalDays) : "", change(s.waterGoalDays, p?.waterGoalDays ?? null, 0)],
    ["Activity, total minutes", fmt(s.activityTotal, 0), p ? fmt(p.activityTotal, 0) : "", change(s.activityTotal, p?.activityTotal ?? null, 0)],
    ["Days with 30+ active minutes", String(s.activeDays), p ? String(p.activeDays) : "", change(s.activeDays, p?.activeDays ?? null, 0)],
    ["Sleep, hours a night", fmt(s.sleepHours), p ? fmt(p.sleepHours) : "", change(s.sleepHours, p?.sleepHours ?? null)],
    ["Woke rested, out of 5", fmt(s.rested), p ? fmt(p.rested) : "", change(s.rested, p?.rested ?? null)],
    ["Mood, out of 5", fmt(s.mood), p ? fmt(p.mood) : "", change(s.mood, p?.mood ?? null)],
    ["Calories logged, a day", fmt(s.calories, 0), p ? fmt(p.calories, 0) : "", { text: change(s.calories, p?.calories ?? null, 0).text, good: null }],
    ["Protein, grams a day", fmt(s.protein, 0), p ? fmt(p.protein, 0) : "", change(s.protein, p?.protein ?? null, 0)],
    ["All medications taken", s.medsRate == null ? "–" : `${Math.round(s.medsRate * 100)}%`, p?.medsRate == null ? "" : `${Math.round(p.medsRate * 100)}%`, change(pct(s.medsRate), pct(p?.medsRate ?? null), 0)],
    ["Steps a day (wearable)", fmt(s.steps, 0), p ? fmt(p.steps, 0) : "", change(s.steps, p?.steps ?? null, 0)],
  ];
  if (s.weightStart != null && s.weightEnd != null) {
    rows.push(["Weight (wearable), start to end", `${fmt(s.weightStart)} to ${fmt(s.weightEnd)} kg`, "", { text: "", good: null }]);
  }
  // Leave out lines with nothing logged on either side.
  const empty = (v: string) => v === "" || v === "–" || v === "0";
  return rows.filter(([label, now, before]) => label === "Days logged" || !empty(now) || !empty(before));
}

export function buildReportPdf(report: Report, generatedAt: Date): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 44;
  let y = M;

  const room = (needed: number) => { if (y + needed > H - M - 20) { doc.addPage(); y = M; } };
  const after = () => ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 22;
  const heading = (text: string, needed = 80) => {
    room(needed);
    doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...INK).text(text, M, y);
    y += 16;
  };
  const para = (text: string, size = 10.5, color = 40) => {
    doc.setFont("helvetica", "normal").setFontSize(size).setTextColor(color);
    const lines = doc.splitTextToSize(text, W - 2 * M) as string[];
    room(lines.length * size * 1.35);
    doc.text(lines, M, y);
    y += lines.length * size * 1.35 + 4;
  };
  const bullets = (items: string[]) => {
    for (const item of items) {
      doc.setFont("helvetica", "normal").setFontSize(10.5).setTextColor(40);
      const lines = doc.splitTextToSize(item, W - 2 * M - 14) as string[];
      room(lines.length * 14 + 4);
      doc.setFillColor(...GREEN).circle(M + 3, y - 3.5, 2, "F");
      doc.text(lines, M + 14, y);
      y += lines.length * 14 + 4;
    }
    y += 8;
  };

  // A small bar chart of one series, with the goal as a dashed line.
  const chart = (title: string, key: keyof typeof BARS, max: number, goal: number | null, unit: string) => {
    const values = report.series.map((s) => s[key as "water"]);
    if (values.filter((v) => v != null && v > 0).length < 2) return;
    const h = 70, w = W - 2 * M, top = y + 14;
    room(h + 40);
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(60).text(title, M, y);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(MUTED).text(unit, W - M, y, { align: "right" });
    doc.setDrawColor(225).setLineWidth(0.5).line(M, top + h, M + w, top + h);
    const slot = w / values.length, bar = Math.max(2, Math.min(18, slot * 0.65));
    values.forEach((v, i) => {
      if (v == null || v <= 0) return;
      const bh = Math.min(1, v / max) * h;
      doc.setFillColor(...BARS[key]).rect(M + i * slot + (slot - bar) / 2, top + h - bh, bar, bh, "F");
    });
    if (goal != null && goal <= max) {
      const gy = top + h - (goal / max) * h;
      doc.setDrawColor(...INK).setLineWidth(0.6).setLineDashPattern([3, 3], 0).line(M, gy, M + w, gy).setLineDashPattern([], 0);
      doc.setFontSize(7.5).setTextColor(...INK).text(`goal ${goal}`, M + w, gy - 3, { align: "right" });
    }
    // Labels: every one for months, about weekly for days.
    doc.setFontSize(7.5).setTextColor(MUTED);
    const every = values.length > 14 ? 7 : 1;
    report.series.forEach((s, i) => {
      if (i % every === 0 || i === values.length - 1) doc.text(s.label, M + i * slot + slot / 2, top + h + 10, { align: "center" });
    });
    y = top + h + 28;
  };

  // ── Title ──
  doc.setFillColor(...GREEN).rect(0, 0, W, 6, "F");
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...GREEN)
    .text(report.kind === "month" ? "FIKKO MONTHLY DEEP-DIVE" : "FIKKO LIFETIME REPORT", M, y + 8);
  doc.setFontSize(24).setTextColor(...INK).text(report.title, M, y + 36);
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(MUTED).text(report.subtitle, M, y + 54);
  y += 84;

  if (!report.current.daysLogged) {
    para("There's nothing logged in this period yet. Log a few days of water, meals, sleep or mood and this report fills in.");
    return finish(doc, generatedAt);
  }

  // ── At a glance ──
  heading("At a glance", 160);
  const monthly = report.kind === "month";
  const rows = glanceRows(report.current, report.previous, report.goals);
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [monthly && report.previous ? ["", "This month", "Last month", "Change"] : ["", monthly ? "This month" : "All time"]],
    body: rows.map(([label, now, before, ch]) => (monthly && report.previous ? [label, now, before, ch.text] : [label, now])),
    theme: "plain",
    styles: { fontSize: 10, cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }, textColor: 40 },
    headStyles: { fontStyle: "bold", textColor: INK, fillColor: [238, 246, 242] },
    columnStyles: { 0: { cellWidth: 210 }, 1: { halign: "right" }, 2: { halign: "right", textColor: MUTED }, 3: { halign: "right", fontStyle: "bold" } },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    didParseCell: (cell) => {
      if (cell.section !== "body" || cell.column.index !== 3) return;
      const good = rows[cell.row.index]?.[3].good;
      if (good != null) cell.cell.styles.textColor = good ? GREEN : [180, 83, 9];
    },
  });
  y = after();

  if (report.highlights.length) { heading("Highlights"); bullets(report.highlights); }

  if (report.patterns.length) {
    heading("Patterns worth knowing");
    bullets(report.patterns);
    para("These show what tended to go together in your logs, not what caused what. Worth an experiment, not a rule.", 9, MUTED);
    y += 8;
  } else {
    heading("Patterns worth knowing", 60);
    para("No clear patterns yet. They show up once there are at least three days on each side of a comparison, so keep logging sleep and mood.", 10, MUTED);
    y += 8;
  }

  // ── Charts ──
  heading(monthly ? "Day by day" : "Month by month", 140);
  chart("Water", "water", Math.max(report.goals.water * 1.5, ...report.series.map((s) => s.water ?? 0)), report.goals.water, monthly ? "glasses" : "glasses a day, average");
  chart("Sleep", "sleep", 12, report.goals.sleep, monthly ? "hours" : "hours a night, average");
  chart("Mood", "mood", 5, null, "out of 5");
  chart("Activity", "activity", Math.max(60, ...report.series.map((s) => s.activity ?? 0)), 30, monthly ? "minutes" : "minutes a day, average");

  // ── Lifetime: one row a month ──
  if (!monthly && report.months.length) {
    heading("Each month", 120);
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [["Month", "Days logged", "Water", "Active days", "Sleep (h)", "Mood", "Calories"]],
      body: report.months.map((m) => [m.label, `${m.daysLogged}/${m.days}`, fmt(m.water), String(m.activeDays), fmt(m.sleepHours), fmt(m.mood), fmt(m.calories, 0)]),
      theme: "plain",
      styles: { fontSize: 9.5, cellPadding: 5, textColor: 40, halign: "right" },
      headStyles: { fontStyle: "bold", textColor: INK, fillColor: [238, 246, 242], halign: "right" },
      columnStyles: { 0: { halign: "left" } },
      alternateRowStyles: { fillColor: [250, 250, 250] },
    });
    y = after();
  }

  // ── Weekdays and weekends ──
  if (report.split.length) {
    heading("Weekdays and weekends", 120);
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [["Average", "Weekdays", "Weekends"]],
      body: report.split.map((r) => [r.label, r.weekday, r.weekend]),
      theme: "plain",
      styles: { fontSize: 10, cellPadding: 5, textColor: 40 },
      headStyles: { fontStyle: "bold", textColor: INK, fillColor: [238, 246, 242] },
      columnStyles: { 0: { cellWidth: 210 }, 1: { halign: "right" }, 2: { halign: "right" } },
    });
    y = after();
  }

  // ── Food ──
  if (report.topFoods.length || report.macroSplit) {
    heading("Food", 120);
    if (report.macroSplit) {
      const m = report.macroSplit;
      para(`Of the calories from foods with nutrition details, ${m.protein}% came from protein, ${m.carbs}% from carbs and ${m.fat}% from fat.`);
    }
    if (report.topFoods.length) {
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [["Foods you logged most", "Times"]],
        body: report.topFoods.map((f) => [f.name, String(f.times)]),
        theme: "plain",
        styles: { fontSize: 10, cellPadding: 4, textColor: 40 },
        headStyles: { fontStyle: "bold", textColor: INK, fillColor: [238, 246, 242] },
        columnStyles: { 1: { halign: "right", cellWidth: 60 } },
      });
      y = after();
    }
  }

  // ── Custom habits ──
  if (report.customHabits.length) {
    heading("Your own habits", 100);
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [["Habit", "Target", "Days logged", "Days at target", "Average"]],
      body: report.customHabits.map((h) => [h.name, `${h.target} ${h.unit}`.trim(), String(h.daysLogged), String(h.daysAtTarget), fmt(h.average)]),
      theme: "plain",
      styles: { fontSize: 10, cellPadding: 5, textColor: 40 },
      headStyles: { fontStyle: "bold", textColor: INK, fillColor: [238, 246, 242] },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    });
    y = after();
  }

  return finish(doc, generatedAt);
}

/** Page numbers and the note on every page. */
function finish(doc: jsPDF, generatedAt: Date) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(140);
    doc.text(`Made by Fikko on ${generatedAt.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })} from what you logged. A wellness summary, not medical advice.`, 44, H - 24);
    doc.text(`${i} / ${pages}`, W - 44, H - 24, { align: "right" });
  }
  return doc;
}
