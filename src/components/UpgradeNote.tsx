import { Lock } from "lucide-react";
import { usePlan } from "../hooks/usePlan";
import { useUpgrade } from "../hooks/useUpgrade";
import { TRIAL_DAYS } from "../lib/plan";
import { UPGRADE_COPY, type UpgradeReason } from "../lib/upgrade";
import { cn } from "@/lib/utils";

/** A quiet "this is part of a paid plan" note shown where a limit has been reached. */
export default function UpgradeNote({ title, body, reason = "general", action, className }: {
  title: string;
  body: string;
  /** What the upgrade window talks about when it opens from here. */
  reason?: UpgradeReason;
  /** The link's words; by default the free trial when there is one, otherwise "See plans". */
  action?: string;
  className?: string;
}) {
  const openUpgrade = useUpgrade();
  const { trialAvailable } = usePlan();
  const label = action ?? (trialAvailable && UPGRADE_COPY[reason].plan === "premium" ? `Try Premium free for ${TRIAL_DAYS} days` : "See plans");
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-dashed bg-white/60 px-4 py-3.5", className)}>
      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
        {openUpgrade && (
          <button type="button" onClick={() => openUpgrade(reason)} className="mt-2 inline-block text-sm font-medium text-primary-ink underline-offset-4 hover:underline">
            {label}
          </button>
        )}
      </div>
    </div>
  );
}
