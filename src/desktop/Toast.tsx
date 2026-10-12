import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Sprout, type LucideIcon } from "lucide-react";

interface Toast { id: number; text: string; icon: LucideIcon }

/**
 * The desktop layout's one-line confirmations ("Glass of water added"),
 * rising in at the bottom of the window for a couple of seconds. A log that
 * finishes a habit says the plant grew, as on the phone.
 * Returns the toast to render and the function that shows one.
 */
export function useDesktopToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number>(undefined);
  const show = useCallback((text: string, opts?: { grew?: boolean }) => {
    window.clearTimeout(timer.current);
    setToast({ id: Date.now(), text: opts?.grew ? `${text}. Your plant grew.` : text, icon: opts?.grew ? Sprout : Check });
    timer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const node = (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
      {toast && (
        <p key={toast.id} role="status" className="desktop-toast-in flex items-center gap-2.5 rounded-full bg-ink py-2.5 pr-5 pl-2.5 text-sm font-medium text-white shadow-lg">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/15" aria-hidden="true">
            <toast.icon className="size-4" strokeWidth={2.5} />
          </span>
          {toast.text}
        </p>
      )}
    </div>
  );
  return [node, show] as const;
}
