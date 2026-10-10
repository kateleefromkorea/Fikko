import { useState } from "react";
import { exportAllData, exportReport, type ExportFormat } from "../../lib/account";
import { describeRange, periodRange, todayKey, type Period } from "../../lib/dates";
import { ChartLine, Download, FileJson, FileSpreadsheet, FileText, Loader2, Sheet, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { friendlyError } from "../../lib/errors";
import { usePlan } from "../../hooks/usePlan";

const PERIODS: { key: Period | "all"; label: string; pick?: string }[] = [
  { key: "day", label: "Day", pick: "Which day?" },
  { key: "week", label: "Week", pick: "Any day in the week" },
  { key: "month", label: "Month", pick: "Any day in the month" },
  { key: "all", label: "All time" },
];

/** The deep-dive report (report.ts) is its own kind of file, alongside the data exports. */
type Choice = ExportFormat | "report";

const FORMATS: { key: Choice; label: string; description: string; icon: LucideIcon }[] = [
  { key: "report", label: "Deep-dive report", description: "Trends and patterns, PDF", icon: ChartLine },
  { key: "pdf", label: "PDF of my data", description: "Easy to read and print", icon: FileText },
  { key: "daily", label: "Daily spreadsheet", description: "CSV, one row per day", icon: FileSpreadsheet },
  { key: "food", label: "Food diary", description: "CSV, one row per food", icon: Sheet },
  { key: "json", label: "JSON file", description: "For moving to another app", icon: FileJson },
];

const isCsv = (f: Choice) => f === "daily" || f === "food";

interface Props {
  userId: string;
  onClose: () => void;
}

export default function ExportDialog({ userId, onClose }: Props) {
  const { limits } = usePlan();
  const [period, setPeriod] = useState<Period | "all">("month");
  const [day, setDay] = useState(todayKey());
  const [format, setFormat] = useState<Choice>("pdf");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = todayKey();
  const range = period === "all" || !day ? null : periodRange(period, day);
  const pick = PERIODS.find((p) => p.key === period)?.pick;

  // Reports cover a calendar month or all time.
  const reportFits = period === "month" || period === "all";
  const reportName = period === "all" ? "Lifetime report" : "Monthly deep-dive";
  const lockedReason = (key: Choice) =>
    key === "report" ? (!limits.deepDiveReports ? "With Max" : !reportFits ? "Pick Month or All time" : null)
      : isCsv(key) && !limits.csvExport ? "With Max" : null;

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      if (format === "report") await exportReport(userId, period === "all" ? null : day);
      else await exportAllData(userId, format, range);
      onClose();
    } catch (err) {
      setError(friendlyError(err, "Export failed. Please try again."));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[85vh] gap-5 overflow-y-auto p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Export my data</DialogTitle>
          <DialogDescription>Choose a period, then how you'd like the file.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label id="export-period">Period</Label>
          <div role="radiogroup" aria-labelledby="export-period" className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={period === key}
                onClick={() => { setPeriod(key); if (format === "report" && key !== "month" && key !== "all") setFormat("pdf"); }}
                className={cn(
                  "rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                  period === key && "bg-background font-medium text-foreground shadow-sm",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {pick ? (
          <div className="space-y-2">
            <Label htmlFor="export-day">{pick}</Label>
            <Input
              id="export-day"
              type="date"
              value={day}
              max={today}
              onChange={(e) => setDay(e.target.value)}
              className="h-9 w-44"
            />
            <p className="text-sm text-muted-foreground">
              {range ? <>Covers <span className="font-medium text-foreground">{describeRange(range)}</span></> : "Pick a date."}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Everything you've logged since you joined.</p>
        )}

        <div className="space-y-2">
          <Label id="export-format">Format</Label>
          <div role="radiogroup" aria-labelledby="export-format" className="grid grid-cols-2 gap-2">
            {FORMATS.map(({ key, label, description, icon: Icon }) => {
              const locked = lockedReason(key);
              return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={format === key}
                onClick={() => setFormat(key)}
                disabled={!!locked}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
                  format === key && "border-primary bg-primary/5 hover:bg-primary/10",
                )}
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground", format === key && "text-primary-ink")} />
                <span>
                  <span className={cn("block text-sm font-medium", format === key && "text-primary-ink")}>{key === "report" && reportFits ? reportName : label}</span>
                  <span className="block text-xs text-muted-foreground">{locked ?? description}</span>
                </span>
              </button>
              );
            })}
          </div>
        </div>

        {format === "report" ? (
          <p className="text-xs text-muted-foreground">
            {period === "all"
              ? "Your story so far: month-by-month trends, highlights and patterns since your first log."
              : "This month against the one before: highlights, patterns, weekdays against weekends, food and your own habits."}
          </p>
        ) : period !== "all" && (
          <p className="text-xs text-muted-foreground">
            Your profile, habits, medications and saved foods are always included in full.
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy} className="h-9 px-4">Cancel</Button>
          <Button onClick={download} disabled={busy || (period !== "all" && !range)} className="h-9 px-4">
            {busy ? <Loader2 className="animate-spin" /> : <Download />}
            {busy ? "Preparing…" : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
