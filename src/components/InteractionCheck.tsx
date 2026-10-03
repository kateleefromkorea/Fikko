import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Copy, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { checkInteractions, type InteractionResult, type Severity } from "../lib/interactions";
import { COACH_DAILY_LIMIT } from "../lib/coach";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SEVERITY: Record<Severity, { label: string; icon: typeof AlertTriangle; cls: string }> = {
  avoid: { label: "Avoid together", icon: ShieldAlert, cls: "bg-red-50 text-red-700 ring-red-200" },
  caution: { label: "Check with a pharmacist", icon: AlertTriangle, cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  timing: { label: "Space them out", icon: Clock, cls: "bg-sky-50 text-sky-800 ring-sky-200" },
  overlap: { label: "Doubling up", icon: Copy, cls: "bg-violet-50 text-violet-800 ring-violet-200" },
};

/**
 * Checks the member's medications and supplements against each other and
 * lists what to watch for. Runs as soon as it opens.
 */
export default function InteractionCheck({ names, onClose }: { names: string[]; onClose: () => void }) {
  const [result, setResult] = useState<InteractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    checkInteractions(names)
      .then((r) => { if (live) setResult(r); })
      .catch((err) => { if (live) setError(err instanceof Error ? err.message : "We couldn't run the check. Please try again."); });
    return () => { live = false; };
  }, [names]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Interaction check</DialogTitle>
          <DialogDescription>
            Your {names.length} medications and supplements, checked against each other.
          </DialogDescription>
        </DialogHeader>

        {!result && !error && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Checking your list…
          </div>
        )}

        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        {result && (
          <div className="space-y-4">
            {result.findings.length === 0 ? (
              <div className="flex items-start gap-3 rounded-xl bg-primary/5 p-4">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-sm">
                  We didn't find any known interactions between these. That doesn't rule everything out, so mention
                  your full list to your pharmacist or doctor.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {result.findings.map((f) => {
                  const s = SEVERITY[f.severity];
                  return (
                    <li key={f.items.join("|")} className="rounded-xl border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{f.items[0]} + {f.items[1]}</p>
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1", s.cls)}>
                          <s.icon className="size-3" aria-hidden="true" /> {s.label}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{f.advice}</p>
                      {f.source === "ai" && (
                        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                          <Sparkles className="size-3" aria-hidden="true" /> From Fikko's AI review
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {result.ai === "used" && (
              <p className="text-xs text-muted-foreground">
                {listNames(result.unrecognised)} {result.unrecognised.length === 1 ? "isn't" : "aren't"} on Fikko's
                built-in list, so our AI reviewed {result.unrecognised.length === 1 ? "it" : "them"}. This used 1 of your
                {" "}{COACH_DAILY_LIMIT} daily AI messages.
              </p>
            )}
            {result.ai === "limit" && (
              <p className="text-xs text-muted-foreground">
                {listNames(result.unrecognised)} {result.unrecognised.length === 1 ? "isn't" : "aren't"} on Fikko's
                built-in list, and you've used today's AI messages, so {result.unrecognised.length === 1 ? "it wasn't" : "they weren't"} checked.
                Try again tomorrow.
              </p>
            )}
            {result.ai === "unavailable" && (
              <p className="text-xs text-muted-foreground">
                {listNames(result.unrecognised)} {result.unrecognised.length === 1 ? "isn't" : "aren't"} on Fikko's
                built-in list and our AI review isn't available right now, so {result.unrecognised.length === 1 ? "it wasn't" : "they weren't"} checked.
              </p>
            )}

            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              This is general information, not medical advice. Never stop or change a prescribed medicine without
              talking to your doctor, and check with a pharmacist before starting something new.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const listNames = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
