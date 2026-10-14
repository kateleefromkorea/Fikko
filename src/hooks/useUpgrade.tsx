import { createContext, lazy, Suspense, useCallback, useContext, useState, type ReactNode } from "react";
import type { UpgradeReason } from "../lib/upgrade";

const UpgradeDialog = lazy(() => import("../components/UpgradeDialog"));

type OpenUpgrade = (reason?: UpgradeReason) => void;

// Null where there's no provider: the iPhone and Android apps (mobile/) leave it
// out, as app stores restrict pointing members to outside payment.
const UpgradeContext = createContext<OpenUpgrade | null>(null);

/** Lets any screen open the upgrade window, e.g. useUpgrade()?.("ai-limit"). */
export function UpgradeProvider({ children }: { children: ReactNode }) {
  const [reason, setReason] = useState<UpgradeReason>("general");
  const [open, setOpen] = useState(false);
  // Loaded on first use, so members who never hit a limit don't download it.
  const [used, setUsed] = useState(false);

  const openUpgrade = useCallback((r: UpgradeReason = "general") => {
    setReason(r);
    setUsed(true);
    setOpen(true);
  }, []);

  return (
    <UpgradeContext.Provider value={openUpgrade}>
      {children}
      {used && (
        <Suspense fallback={null}>
          <UpgradeDialog reason={reason} open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </UpgradeContext.Provider>
  );
}

export const useUpgrade = () => useContext(UpgradeContext);
