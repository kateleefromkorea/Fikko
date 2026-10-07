import { useEffect, useState } from "react";
import { Download, EllipsisVertical, Share, SquarePlus, X } from "lucide-react";
import { canPromptInstall, installPlatform, isInstalled, onInstallChange, promptInstall } from "../lib/install";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "fikko-install-dismissed-at";
/** After "Not now", the card stays away this long. */
const DISMISS_DAYS = 30;

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * A card on the Habits page inviting phone members to add Fikko to their home
 * screen. Hidden once installed, on computers (unless the browser offers its
 * own install), and for 30 days after "Not now".
 */
export default function InstallCard() {
  const [platform] = useState(installPlatform);
  const [canPrompt, setCanPrompt] = useState(canPromptInstall);
  const [hidden, setHidden] = useState(() => isInstalled() || dismissedRecently());

  useEffect(() => onInstallChange(() => {
    setCanPrompt(canPromptInstall());
    if (isInstalled()) setHidden(true);
  }), []);

  if (hidden || (platform === "desktop" && !canPrompt)) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* it'll show again next visit */ }
    setHidden(true);
  };

  return (
    <aside aria-labelledby="install-title" className="relative flex gap-4 rounded-2xl border bg-card p-4 pr-11 shadow-xs sm:p-5 sm:pr-12">
      <img src="/icon-192.png" alt="" className="size-12 shrink-0 rounded-xl shadow-sm" />
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <h2 id="install-title" className="font-semibold">Add Fikko to your home screen</h2>
          <p className="text-sm text-muted-foreground">It opens full screen like an app, one tap away when it&apos;s time to check in.</p>
        </div>

        {canPrompt ? (
          <Button onClick={() => void promptInstall()} className="h-9">
            <Download />
            Install Fikko
          </Button>
        ) : platform === "ios" ? (
          <ol className="list-decimal space-y-1 pl-5 text-sm marker:font-medium">
            <li>
              Tap Share <Share className="inline size-4 -translate-y-px text-primary" aria-label="(the square with an arrow)" />{" "}
              <span className="text-muted-foreground">(in Safari it may be under ⋯)</span>
            </li>
            <li>Choose Add to Home Screen <SquarePlus className="inline size-4 -translate-y-px text-primary" aria-hidden="true" /></li>
          </ol>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-sm marker:font-medium">
            <li>Open your browser menu <EllipsisVertical className="inline size-4 -translate-y-px text-primary" aria-label="(three dots)" /></li>
            <li>Choose Install app or Add to Home screen</li>
          </ol>
        )}

        <a href="/install.html" target="_blank" rel="noreferrer" className="inline-block text-sm text-primary underline-offset-4 hover:underline">
          Step-by-step guide
        </a>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Not now" className="absolute top-2 right-2 text-muted-foreground">
        <X />
      </Button>
    </aside>
  );
}
