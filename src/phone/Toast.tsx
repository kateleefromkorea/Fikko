import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Sprout, type LucideIcon } from "lucide-react";

interface Toast { id: number; text: string; icon: LucideIcon }

const ToastContext = createContext<(text: string, opts?: { grew?: boolean; icon?: LucideIcon }) => void>(() => {});

/** Shows a short confirmation at the top of the screen. `grew` marks a log that completed a habit. */
export function useToast() {
  return useContext(ToastContext);
}

/**
 * The app's one-line confirmations ("Water logged"), dropping in under the
 * status bar for two seconds. A log that finishes a habit says the plant grew,
 * so every tap gets an answer and the reward stays visible.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number>(undefined);
  const show = useCallback((text: string, opts?: { grew?: boolean; icon?: LucideIcon }) => {
    window.clearTimeout(timer.current);
    setToast({ id: Date.now(), text: opts?.grew ? `${text}. Your plant grew.` : text, icon: opts?.icon ?? (opts?.grew ? Sprout : Check) });
    timer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 top-[calc(var(--mobile-top)+0.5rem)] z-[60]">
        {toast && (
          <p key={toast.id} role="status" className="toast-in flex items-center gap-2.5 rounded-2xl bg-ink px-4 py-3.5 text-[15px] font-medium text-white shadow-lg">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/15" aria-hidden="true">
              <toast.icon className="size-4" strokeWidth={2.5} />
            </span>
            {toast.text}
          </p>
        )}
      </div>
    </ToastContext.Provider>
  );
}
