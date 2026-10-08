import { Lock } from "lucide-react";
import { PLANS_URL } from "../lib/plan";
import { cn } from "@/lib/utils";

/** A quiet "this is part of a paid plan" note shown where a limit has been reached. */
export default function UpgradeNote({ title, body, className }: { title: string; body: string; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-dashed bg-white/60 px-4 py-3.5", className)}>
      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
        <a href={PLANS_URL} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-primary-ink underline-offset-4 hover:underline">
          See plans
        </a>
      </div>
    </div>
  );
}
