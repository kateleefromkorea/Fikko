import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { ACTIVITIES } from "@/lib/activities";
import type { ActivityChoice } from "@/hooks/useActivityLog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import ActivityIcon from "./ActivityIcon";

/** Every activity, searchable, plus anything the member types as their own. */
export default function ActivityPicker({ onPick, onClose }: { onPick: (choice: ActivityChoice) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = q
    ? ACTIVITIES.filter((a) => a.label.toLowerCase().includes(q) || a.match?.test(q))
    : ACTIVITIES;
  const exact = matches.some((a) => a.label.toLowerCase() === q);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* A bottom sheet on phones, a centred window on larger screens. */}
      <DialogContent className="top-auto bottom-0 max-h-[85vh] max-w-full translate-y-0 gap-4 overflow-y-auto rounded-b-none p-5 sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-y-1/2 sm:rounded-b-xl sm:p-6">
        <DialogHeader>
          <DialogTitle>Choose an activity</DialogTitle>
          <DialogDescription>Search, or type your own.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !q) return;
              e.preventDefault();
              onPick(matches.length === 1 ? { type: matches[0].type, name: "" } : { type: "other", name: query.trim() });
            }}
            placeholder="Tennis, rowing, paddleboarding…"
            aria-label="Search activities"
            autoFocus
            className="h-11 pl-9 text-base md:text-base"
          />
        </div>
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2" aria-label="Activities">
          {matches.map((a) => (
            <li key={a.type}>
              <button
                type="button"
                onClick={() => onPick({ type: a.type, name: "" })}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-muted"
              >
                <ActivityIcon type={a.type} />
                {a.label}
              </button>
            </li>
          ))}
          {q && !exact && (
            <li className="sm:col-span-2">
              <button
                type="button"
                onClick={() => onPick({ type: "other", name: query.trim() })}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
                  <Plus className="size-4" />
                </span>
                <span>Add “<span className="font-medium">{query.trim()}</span>” as your own activity</span>
              </button>
            </li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
