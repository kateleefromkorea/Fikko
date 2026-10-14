import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { estimateMissingMacros } from "../lib/foodMacros";
import { friendlyError } from "../lib/errors";
import { Button } from "@/components/ui/button";

/**
 * Under the macro bars: says how many foods have no macro figures and, for the
 * ones the AI can estimate (everything logged before AI foods came with macros,
 * or typed in without them), offers to fill them in. `onFilled` reloads the log.
 */
export default function MissingMacrosNote({ missing, onFilled }: { missing: number; onFilled: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function estimate() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { updated, remaining } = await estimateMissingMacros();
      setMessage(
        updated === 0
          ? "Nothing more could be estimated."
          : `Estimated ${updated} ${updated === 1 ? "food" : "foods"} across your log. These are AI estimates.${remaining > 0 ? ` ${remaining} more to go: tap again.` : ""}`,
      );
      if (updated > 0) onFilled();
    } catch (err) {
      setError(friendlyError(err, "We couldn't estimate those right now. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  if (missing <= 0 && !message) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
      {missing > 0 && (
        <>
          <p>
            {missing} item{missing === 1 ? "" : "s"} without macro data {missing === 1 ? "isn't" : "aren't"} counted in these bars.
          </p>
          <Button variant="outline" size="sm" onClick={() => void estimate()} disabled={busy} className="h-8 gap-1.5">
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy ? "Estimating…" : "Estimate with AI"}
          </Button>
        </>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </div>
  );
}
