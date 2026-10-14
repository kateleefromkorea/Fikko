import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { SAVED_FOODS_CHANGED, countSavedMissing, estimateMissingMacros } from "../lib/foodMacros";
import { friendlyError } from "../lib/errors";
import { Button } from "@/components/ui/button";

/**
 * Under the macro bars: says how many foods have no macro figures and offers to
 * fill them in with the AI. That covers the foods in the log (`missing`, counted by the
 * page) and the member's saved foods and saved meals, which are counted here: filling
 * those in means every future log of them has macros too. `onFilled` reloads the log.
 */
export default function MissingMacrosNote({ missing, onFilled }: { missing: number; onFilled: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMissing, setSavedMissing] = useState(0);

  useEffect(() => {
    let live = true;
    const count = () => void countSavedMissing().then((n) => { if (live) setSavedMissing(n); });
    count();
    window.addEventListener(SAVED_FOODS_CHANGED, count);
    return () => { live = false; window.removeEventListener(SAVED_FOODS_CHANGED, count); };
  }, []);

  async function estimate() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { updated, remaining } = await estimateMissingMacros();
      setMessage(
        updated === 0
          ? "Nothing more could be estimated."
          : `Estimated ${updated} ${updated === 1 ? "food" : "foods"} across your log and saved foods. These are AI estimates.${remaining > 0 ? ` ${remaining} more to go: tap again.` : ""}`,
      );
      if (updated > 0) onFilled();
    } catch (err) {
      setError(friendlyError(err, "We couldn't estimate those right now. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  const any = missing > 0 || savedMissing > 0;
  if (!any && !message) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
      {any && (
        <>
          <p>
            {missing > 0 && (
              <>
                {missing} item{missing === 1 ? "" : "s"} without macro data {missing === 1 ? "isn't" : "aren't"} counted in these bars.
              </>
            )}
            {missing > 0 && savedMissing > 0 && " "}
            {savedMissing > 0 && (
              <>
                {savedMissing} saved food{savedMissing === 1 ? " has" : "s have"} none either, so logging {savedMissing === 1 ? "it" : "them"} again won&apos;t count.
              </>
            )}
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
