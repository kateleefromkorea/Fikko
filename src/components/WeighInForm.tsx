import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { BiometricData } from "../types";
import { deleteWeighIn, saveWeighIn } from "../lib/adaptiveData";
import { kgToLb, lbToKg, LIMITS } from "../lib/metabolics";
import { friendlyError } from "../lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Type in a weigh-in for a day. Weigh-ins drive the weight trend that adaptive
 * targets learn from; a few a week is plenty. Shows the day's current reading.
 */
export default function WeighInForm({ userId, date, biometrics, unit = "kg", onSaved }: {
  userId: string | null;
  date: string;
  biometrics: BiometricData;
  unit?: string;
  onSaved: (message: string) => void;
}) {
  const lb = unit === "lb";
  const current = biometrics.weight.find((e) => e.date === date)?.value ?? null;
  const last = [...biometrics.weight].reverse().find((e) => e.date < date)?.value ?? null;
  const shown = (kg: number) => (lb ? kgToLb(kg) : kg).toFixed(1);
  const [value, setValue] = useState(current != null ? shown(current) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typed = parseFloat(value.replace(",", "."));
  const kg = Number.isFinite(typed) ? (lb ? lbToKg(typed) : typed) : NaN;
  const valid = kg >= LIMITS.weightKg.min && kg <= LIMITS.weightKg.max;

  async function save() {
    if (!userId || !valid) return;
    setBusy(true);
    setError(null);
    try {
      await saveWeighIn(userId, date, kg);
      onSaved(`Weight saved: ${shown(kg)} ${unit}`);
    } catch (err) {
      setError(friendlyError(err, "We couldn't save your weight. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      await deleteWeighIn(userId, date);
      onSaved("Weigh-in removed");
    } catch (err) {
      setError(friendlyError(err, "We couldn't remove that weigh-in."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="weigh-in">Your weight ({unit})</Label>
        <Input
          id="weigh-in"
          inputMode="decimal"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={last != null ? shown(last) : lb ? "165.0" : "75.0"}
          className="h-11 text-lg tabular-nums"
        />
        <p className="text-xs text-muted-foreground">
          {last != null ? `Last time: ${shown(last)} ${unit}. ` : ""}
          Weigh yourself at the same time of day, ideally in the morning. Fikko follows the trend, so day-to-day ups and downs are fine.
        </p>
      </div>
      {value && !valid && <p className="text-sm text-destructive">Enter a weight between {shown(LIMITS.weightKg.min)} and {shown(LIMITS.weightKg.max)} {unit}.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!valid || busy} className="h-10 px-5">
          {busy && <Loader2 className="animate-spin" />}
          Save weight
        </Button>
        {current != null && (
          <Button type="button" variant="ghost" onClick={() => void remove()} disabled={busy} className="h-10 text-muted-foreground">
            Remove what you typed for this day
          </Button>
        )}
      </div>
    </form>
  );
}
