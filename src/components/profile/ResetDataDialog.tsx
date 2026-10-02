import { useState } from "react";
import { Loader2 } from "lucide-react";
import { resetMyLogs } from "../../lib/account";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ERASED = [
  "Meals and foods you've logged",
  "Water, activity, sleep, mood and medication check-offs",
  "Progress on your custom habits",
  "Your AI coach conversation",
];

const KEPT = [
  "Your account, profile and goals",
  "Your medication list, custom habits, saved foods and saved meals",
  "Your Community posts, recipes and points",
  "Data synced from connected devices",
];

/**
 * "Reset my data": erases everything the member has tracked so they can start
 * again, after typing RESET. Afterwards the app reloads so every page starts empty.
 */
export default function ResetDataDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Typing the word, rather than a second click, keeps it from happening by accident.
  async function reset() {
    if (confirmText !== "RESET") return;
    setResetting(true);
    setError(null);
    try {
      await resetMyLogs(userId);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setResetting(false);
    }
  }

  if (done) {
    return (
      <Dialog open onOpenChange={() => window.location.reload()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Your data has been reset</DialogTitle>
            <DialogDescription>Everything you tracked has been erased. Today is a fresh start.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => window.location.reload()}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !resetting) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset all your data?</DialogTitle>
          <DialogDescription>This permanently erases everything you&apos;ve tracked in Fikko. It can&apos;t be undone.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="font-medium text-destructive">Erased</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
              {ERASED.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
          <div>
            <p className="font-medium">Kept</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
              {KEPT.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Want a copy first? Close this and use Export my data.</p>

        <div className="space-y-2">
          <Label htmlFor="reset-confirm">Type <span className="font-mono">RESET</span> to confirm</Label>
          <Input
            id="reset-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void reset(); }}
            autoComplete="off"
            autoCapitalize="characters"
            className="h-9"
          />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={resetting}>Cancel</Button>
          <Button variant="destructive" onClick={() => void reset()} disabled={confirmText !== "RESET" || resetting}>
            {resetting && <Loader2 className="animate-spin" />}
            Reset my data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
