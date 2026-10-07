import { useEffect, useState } from "react";
import { Award } from "lucide-react";
import { FOUNDING_PLACES, fetchFoundingPlace, fetchPlacesLeft, sendFoundingWelcome, type FoundingPlace } from "../lib/founding";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** This member's founding place, loaded once. `undefined` while loading. */
export function useFoundingPlace(userId: string | null) {
  const [place, setPlace] = useState<FoundingPlace | null | undefined>(undefined);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    void fetchFoundingPlace().then((p) => { if (live) setPlace(p); });
    return () => { live = false; };
  }, [userId]);
  return place;
}

const seenKey = (userId: string) => `fikko-founding-welcomed-${userId}`;

/**
 * Shown once, the first time a member with a founding place opens the app
 * after setup. Also asks the server to send the welcome email.
 */
export function FoundingWelcome({ userId }: { userId: string }) {
  const place = useFoundingPlace(userId);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!place) return;
    let seen = false;
    try { seen = localStorage.getItem(seenKey(userId)) === "1"; } catch { /* storage blocked: show it */ }
    if (seen) return;
    setOpen(true);
    void sendFoundingWelcome();
  }, [place, userId]);

  const close = () => {
    setOpen(false);
    try { localStorage.setItem(seenKey(userId), "1"); } catch { /* fine: it may show again */ }
  };

  if (!place) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center sm:text-center">
          <span className="mb-2 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
            <Award className="size-7" />
          </span>
          <DialogTitle className="text-xl">You&apos;re founding member #{place.place}</DialogTitle>
          <DialogDescription className="text-base">
            One of the first {FOUNDING_PLACES} people to join Fikko. Thank you for being here this early.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 rounded-lg bg-muted/60 px-4 py-3 text-sm">
          <li>Fikko is free for everyone while we launch.</li>
          <li>When paid plans arrive, you get <strong>Fikko Premium free for 12 months</strong>, starting the day they launch.</li>
          <li>We&apos;ll email you about a month before your free year ends. We never charge without your agreement.</li>
        </ul>
        <p className="text-center text-xs text-muted-foreground">
          Full terms: <a href="/terms.html#founding-members" target="_blank" rel="noreferrer" className="underline">Founding members</a>
        </p>
        <DialogFooter>
          <Button onClick={close} className="w-full">Start tracking</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Founding member #12" for the Profile identity card. Renders nothing for other members. */
export function FoundingBadge({ userId }: { userId: string }) {
  const place = useFoundingPlace(userId);
  if (!place) return null;
  return (
    <div className="mt-4 flex w-full items-start gap-3 rounded-lg bg-primary/8 px-4 py-3 text-left">
      <Award className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-primary-ink">Founding member #{place.place}</p>
        <p className="text-muted-foreground">
          Premium free for 12 months once paid plans launch.{" "}
          <a href="/terms.html#founding-members" target="_blank" rel="noreferrer" className="underline">Details</a>
        </p>
      </div>
    </div>
  );
}

/** "37 of 100 founding places left" for the sign-up screen. Hidden if it can't be checked or none are left. */
export function FoundingPlacesLeft({ className }: { className?: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void fetchPlacesLeft().then((n) => { if (live) setLeft(n); });
    return () => { live = false; };
  }, []);
  if (!left) return null;
  return (
    <p className={className}>
      <Award className="mr-1 inline size-4 -translate-y-px text-primary" aria-hidden="true" />
      <strong className="font-semibold text-foreground">{left} of {FOUNDING_PLACES}</strong> founding places left: finish setup to get Premium free for a year once paid plans launch.
    </p>
  );
}
