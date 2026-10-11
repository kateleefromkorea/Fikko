import { ChartNoAxesColumn, Plus, Sparkles, Sprout, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tab = "today" | "progress" | "coach" | "you";

const LEFT: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "today", label: "Today", icon: Sprout },
  { id: "progress", label: "Progress", icon: ChartNoAxesColumn },
];
const RIGHT: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "coach", label: "Coach", icon: Sparkles },
  { id: "you", label: "You", icon: UserRound },
];

/**
 * Four tabs with the capture button in the middle, where the thumb rests.
 * The capture button is the app's main action: everything can be logged from it.
 */
export default function TabBar({ tab, onTab, onCapture }: { tab: Tab; onTab: (t: Tab) => void; onCapture: () => void }) {
  const item = ({ id, label, icon: Icon }: (typeof LEFT)[number]) => {
    const active = tab === id;
    return (
      <li key={id}>
        <button
          onClick={() => onTab(id)}
          aria-current={active ? "page" : undefined}
          className={cn(
            "press flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold outline-none",
            active ? "text-primary-ink" : "text-[#6A7479]",
          )}
        >
          <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
          {label}
        </button>
      </li>
    );
  };

  return (
    <nav aria-label="Main" className="tabbar-glass fixed inset-x-0 bottom-0 z-40 border-t border-ink/8 pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-[1fr_1fr_5.5rem_1fr_1fr] px-2">
        {LEFT.map(item)}
        <li className="relative">
          <button
            onClick={onCapture}
            aria-label="Log something"
            className="capture-fab press absolute left-1/2 -top-5 grid size-16 -translate-x-1/2 place-items-center rounded-full text-white outline-none focus-visible:ring-4 focus-visible:ring-ring/50"
          >
            <Plus className="size-8" strokeWidth={2.5} aria-hidden="true" />
          </button>
        </li>
        {RIGHT.map(item)}
      </ul>
    </nav>
  );
}
