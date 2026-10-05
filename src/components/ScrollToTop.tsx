import { useEffect, useState } from "react";
import FikkoAvatar from "./FikkoAvatar";
import { cn } from "@/lib/utils";

/** Scrolled this far (px) before the button appears. */
const SHOW_AFTER = 500;

/** A floating Fikko sprout that appears once the page is scrolled down and takes you back to the top. */
export default function ScrollToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > SHOW_AFTER);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
      aria-label="Scroll to top"
      tabIndex={show ? 0 : -1}
      aria-hidden={!show}
      // On phones it sits above the bottom tab bar.
      className={cn(
        "group fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 grid size-12 place-items-center rounded-full border border-primary/20 bg-white shadow-lg shadow-primary/10 outline-none transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 motion-reduce:transition-none sm:right-6 md:bottom-6",
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      {/* Says what the sprout does; part of the button, so tapping it works too. */}
      <span aria-hidden="true" className="absolute right-0 bottom-full mb-2 rounded-full bg-primary px-2.5 py-1 text-xs font-medium whitespace-nowrap text-primary-foreground shadow-md">
        Scroll to top
      </span>
      <FikkoAvatar plain className="size-7 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110" />
    </button>
  );
}
