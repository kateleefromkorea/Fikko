import { useUpgrade } from "../hooks/useUpgrade";
import type { UpgradeReason } from "../lib/upgrade";
import { cn } from "@/lib/utils";

/** An inline "Get more" link that opens the upgrade window; nothing where upgrading isn't offered. */
export default function UpgradeLink({ reason, children, className }: { reason: UpgradeReason | null; children: React.ReactNode; className?: string }) {
  const openUpgrade = useUpgrade();
  if (!openUpgrade || !reason) return null;
  return (
    <button type="button" onClick={() => openUpgrade(reason)} className={cn("font-medium text-primary-ink underline underline-offset-2", className)}>
      {children}
    </button>
  );
}
