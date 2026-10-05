import { activityOf } from "@/lib/activities";
import { cn } from "@/lib/utils";

/** An activity's icon in a soft exercise-coloured circle. */
export default function ActivityIcon({ type, className }: { type: string; className?: string }) {
  const Icon = activityOf(type).icon;
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-exercise/12 text-exercise-strong", className)} aria-hidden="true">
      <Icon className="size-[18px]" />
    </span>
  );
}
