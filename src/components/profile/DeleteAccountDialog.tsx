import { useState } from "react";
import type { ProfileRow } from "../../hooks/useProfile";
import { deleteAccount, DELETION_GRACE_DAYS, type ExportFormat } from "../../lib/account";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { friendlyError } from "../../lib/errors";

// Leaving takes two steps: an optional "why?" that can offer a fix for the
// reason given, then the confirmation. The first step never blocks: every
// offer sits alongside a plain "Continue" so nobody has to argue their way out.

const REASONS = [
  { key: "reminders", label: "Too many reminders" },
  { key: "break", label: "I'm taking a break" },
  { key: "effort", label: "Logging takes too long" },
  { key: "switching", label: "Moving to another app" },
  { key: "privacy", label: "Privacy concerns" },
  { key: "other", label: "Something else" },
] as const;
type Reason = (typeof REASONS)[number]["key"];

interface Props {
  profile: ProfileRow;
  onUpdateProfile: (patch: Partial<ProfileRow>) => void;
  onExport: (format: ExportFormat) => Promise<void>;
  exporting: boolean;
  onSignOut: () => void;
  onClose: () => void;
}

export default function DeleteAccountDialog({ profile, onUpdateProfile, onExport, exporting, onSignOut, onClose }: Props) {
  const [step, setStep] = useState<"why" | "confirm">("why");
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerTaken, setOfferTaken] = useState<string | null>(null);

  const purgeDate = new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000)
    .toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  const takeBreak = () => {
    if (profile.reminders_enabled) onUpdateProfile({ reminders_enabled: false });
    onSignOut();
  };

  // Typing the word, rather than a second click, keeps it from happening by accident.
  const confirm = async () => {
    if (confirmText !== "DELETE") return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount(reason ? { reason, details: reason === "other" ? details : "" } : undefined);
      // Signing out returns the app to the login screen.
    } catch (err) {
      setError(friendlyError(err, "We couldn't delete your account. Please try again."));
      setDeleting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !deleting && onClose()}>
      <DialogContent className="max-h-[85vh] gap-5 overflow-y-auto p-6 sm:max-w-md">
        {step === "why" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Before you go</DialogTitle>
              <DialogDescription>Mind telling us why you're leaving? It's optional and anonymous.</DialogDescription>
            </DialogHeader>

            <div role="radiogroup" aria-label="Reason for leaving" className="grid grid-cols-2 gap-2">
              {REASONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={reason === key}
                  onClick={() => { setReason(reason === key ? null : key); setOfferTaken(null); }}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted",
                    reason === key && "border-primary bg-primary/5 font-medium text-primary-ink hover:bg-primary/10",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {reason === "other" && (
              <div className="space-y-2">
                <Label htmlFor="leave-details">Anything you'd like to tell us?</Label>
                <Textarea id="leave-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} />
              </div>
            )}

            {reason && reason !== "other" && (
              <Offer
                reason={reason}
                profile={profile}
                taken={offerTaken}
                exporting={exporting}
                onTurnOffReminders={() => { onUpdateProfile({ reminders_enabled: false }); setOfferTaken("Reminders are off. You can turn them back on in Preferences."); }}
                onSimplify={() => { onUpdateProfile({ tracking_style: "Simple calories" }); setOfferTaken("Switched to Simple calories: just the calorie total for each meal."); }}
                onTakeBreak={takeBreak}
                onExport={onExport}
              />
            )}

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" onClick={onClose} className="h-9 px-4">Keep my account</Button>
              <Button variant="ghost" onClick={() => setStep("confirm")} className="h-9 px-4 text-muted-foreground">
                Continue to delete
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Delete your account?</DialogTitle>
              <DialogDescription>
                You'll be signed out on every device. Your account is permanently deleted on{" "}
                <span className="font-medium text-foreground">{purgeDate}</span>. Sign back in before then to restore it.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                After that, your profile, every habit you've logged, your food log, medications and saved foods, your
                Community posts and comments, the recipes and photos you've shared, and your points are gone for good.
                Until then, your posts and recipes are hidden from other members.
              </p>
              <Button variant="outline" onClick={() => onExport("pdf")} disabled={exporting} className="h-9 px-4">
                {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                {exporting ? "Preparing export…" : "Download my data (PDF)"}
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="delete-confirm">
                Type <span className="font-mono">DELETE</span> to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                className="h-9 w-40"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep("why")} disabled={deleting} className="h-9 px-4">Back</Button>
              <Button
                onClick={confirm}
                disabled={confirmText !== "DELETE" || deleting}
                className="h-9 bg-destructive px-4 text-white hover:bg-destructive/90"
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface OfferProps {
  reason: Exclude<Reason, "other">;
  profile: ProfileRow;
  taken: string | null;
  exporting: boolean;
  onTurnOffReminders: () => void;
  onSimplify: () => void;
  onTakeBreak: () => void;
  onExport: (format: ExportFormat) => Promise<void>;
}

/** A fix matched to the reason given, if there is one worth offering. */
function Offer({ reason, profile, taken, exporting, onTurnOffReminders, onSimplify, onTakeBreak, onExport }: OfferProps) {
  if (taken) {
    return <p role="status" className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">{taken}</p>;
  }

  const offer = (() => {
    switch (reason) {
      case "reminders":
        return profile.reminders_enabled
          ? { text: "You can turn reminders off and keep everything else.", action: "Turn off reminders", run: onTurnOffReminders }
          : { text: "Reminders are already off for you, so Fikko won't nudge you." };
      case "break":
        return { text: "Take a break instead: we'll turn off reminders and sign you out. Everything's here when you're back.", action: "Take a break", run: onTakeBreak };
      case "effort":
        return profile.tracking_style === "Detailed macros"
          ? { text: "Simple calories logs just the total for each meal, which is much quicker.", action: "Switch to Simple calories", run: onSimplify }
          : null;
      case "switching":
        return { text: "Take your history with you. The JSON file has everything, ready to import elsewhere.", action: "Download JSON", run: () => onExport("json"), busy: true };
      case "privacy":
        return { text: "See exactly what Fikko stores about you in a readable report.", action: "Download PDF", run: () => onExport("pdf"), busy: true };
    }
  })();
  if (!offer) return null;

  return (
    <div className="space-y-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
      <p>{offer.text}</p>
      {"action" in offer && offer.run && (
        <Button size="sm" onClick={offer.run} disabled={"busy" in offer && exporting} className="h-8 px-3">
          {"busy" in offer && exporting ? <Loader2 className="animate-spin" /> : null}
          {offer.action}
        </Button>
      )}
    </div>
  );
}
