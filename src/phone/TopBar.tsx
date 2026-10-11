import { Search } from "lucide-react";
import FikkoAvatar from "@/components/FikkoAvatar";
import { cn } from "@/lib/utils";

/**
 * The app's top bar on every main screen: the Fikko sprout (back to Today),
 * a search field that opens search, and your profile on the right. It sits
 * under the status bar on frosted glass, so content scrolls behind it.
 */
export default function TopBar({ initials, profileActive, onHome, onSearch, onProfile }: {
  initials: string;
  profileActive: boolean;
  onHome: () => void;
  onSearch: () => void;
  onProfile: () => void;
}) {
  return (
    <header className="tabbar-glass sticky top-0 z-40 -mx-4 px-4 pt-(--mobile-top) shadow-[0_1px_0_rgb(0_31_39/0.08)]">
      <div className="flex h-14 items-center gap-3">
        <button onClick={onHome} aria-label="Fikko, go to Today" className="press -ml-1 grid size-11 shrink-0 place-items-center rounded-full">
          <FikkoAvatar className="size-9" />
        </button>

        <button
          onClick={onSearch}
          className="press flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-ink/[0.06] px-3.5 text-left text-[15px] text-muted-foreground"
        >
          <Search className="size-[1.125rem] shrink-0" aria-hidden="true" />
          <span className="truncate">Search or ask Fikko</span>
        </button>

        <button
          onClick={onProfile}
          aria-label="Your profile"
          aria-current={profileActive ? "page" : undefined}
          className={cn(
            "press grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold",
            profileActive ? "bg-primary text-white" : "bg-primary/10 text-primary-ink",
          )}
        >
          {initials}
        </button>
      </div>
    </header>
  );
}
