import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { useAuth } from "./AuthProvider";
import TestimonialLoop, { TESTIMONIAL_STRIP_HEIGHT } from "./TestimonialLoop";
import { SHOW_TESTIMONIALS } from "./mockTestimonials";

const fieldCls =
  "px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-ring";

// Cycled one at a time under the greeting: movement, strength, hydration,
// mood and fitness — the things Fikko tracks.
const ICONS = ["👟", "🏋️", "💧", "😊", "🧘", "🚴"];
const ICON_INTERVAL_MS = 1600;

function RotatingIcons({ size }: { size: number }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Respect reduced-motion: leave the first icon in place instead of cycling.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % ICONS.length), ICON_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="rounded-full flex items-center justify-center"
      style={{ width: size, height: size, background: "rgba(255, 255, 255, 0.14)", border: "1px solid rgba(255, 255, 255, 0.25)" }}
    >
      {/* Keyed by index so each new icon remounts and replays the spin-in. */}
      <span key={index} className="icon-spin-in leading-none" style={{ fontSize: Math.round(size * 0.56) }}>
        {ICONS[index]}
      </span>
    </div>
  );
}

const PAGE_PAD_Y = 16; // py-4, top and bottom
const SUBTITLE_GAP = 8; // mt-2

/**
 * Sizes the greeting block to the space above a vertically centred card.
 * The card's height depends on its content (sign-in vs sign-up, an error
 * line), so it is measured rather than assumed. The icon and its gaps shrink
 * first on short windows, then the handwriting takes whatever height is left.
 */
function useHeaderFit(cardRef: RefObject<HTMLDivElement | null>, subtitleRef: RefObject<HTMLParagraphElement | null>) {
  const [fit, setFit] = useState({ greeting: 96, icon: 64, gap: 16, testimonials: false });

  useLayoutEffect(() => {
    const card = cardRef.current;
    const subtitle = subtitleRef.current;
    if (!card || !subtitle) return;

    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const measure = () => {
      const above = (window.innerHeight - 2 * PAGE_PAD_Y - card.offsetHeight) / 2;
      const icon = Math.round(clamp(above * 0.3, 40, 64));
      const gap = Math.round(clamp(above * 0.07, 8, 16));
      const rest = SUBTITLE_GAP + subtitle.offsetHeight + 2 * gap + icon;
      const greeting = Math.round(clamp(Math.min(window.innerWidth * 0.11, above - rest - 4), 32, 128));
      // The space below a centred card mirrors the space above it. Only show
      // the testimonial strip when it fits there, so it never pushes the card
      // off centre; on short windows it is simply left out.
      const testimonials = SHOW_TESTIMONIALS && above >= TESTIMONIAL_STRIP_HEIGHT + 8;
      setFit((f) =>
        f.greeting === greeting && f.icon === icon && f.gap === gap && f.testimonials === testimonials
          ? f
          : { greeting, icon, gap, testimonials },
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    ro.observe(subtitle);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [cardRef, subtitleRef]);

  return fit;
}

export default function SignInScreen() {
  const { signInWithPassword, signUpWithPassword, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const fit = useHeaderFit(cardRef, subtitleRef);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } =
      mode === "signin" ? await signInWithPassword(email, password) : await signUpWithPassword(email, password);
    setSubmitting(false);
    if (error) {
      setError(error);
    } else if (mode === "signup") {
      setCheckEmail(true);
    }
  }

  async function handleGoogle() {
    setError(null);
    const { error } = await signInWithGoogle();
    if (error) setError(error);
  }

  return (
    // Three-row grid: equal 1fr rows above and below the card keep it at the
    // exact vertical centre of the window. The greeting block sits at the
    // bottom of the top row, hugging the card, so there is no dead space
    // between them. On a window too short to fit it above a centred card, the
    // top row grows instead of letting the text overlap or clip, and the card
    // shifts down just enough (the page scrolls). useHeaderFit sizes the
    // block so that only happens on unusually short windows.
    <div
      className="min-h-screen app-bg grid px-4 py-4"
      // minmax(0, 1fr) column: without it the grid column grows to the
      // testimonial track's full (very wide) width and the page scrolls sideways.
      style={{ gridTemplateRows: "1fr auto 1fr", gridTemplateColumns: "minmax(0, 1fr)" }}
    >
      <div className="self-end flex flex-col items-center pointer-events-none select-none">
        <p
          className="text-center leading-none whitespace-nowrap"
          style={{
            fontFamily: "'Dancing Script', cursive",
            fontWeight: 600,
            fontSize: fit.greeting,
            color: "rgba(255, 255, 255, 0.9)",
            textShadow: "0 4px 24px rgba(0, 0, 0, 0.25)",
          }}
        >
          Welcome to Fikko
        </p>
        <p
          ref={subtitleRef}
          className="mt-2 text-center text-sm sm:text-lg font-medium"
          style={{ fontFamily: "'Inter', system-ui, sans-serif", color: "rgba(255, 255, 255, 0.85)" }}
        >
          Fikko is an ads-free all rounded wellness app
        </p>
        {/* Equal gaps above and below: centred between subtitle and card. */}
        <div style={{ marginTop: fit.gap, marginBottom: fit.gap }}>
          <RotatingIcons size={fit.icon} />
        </div>
      </div>

      <div className="w-full max-w-sm justify-self-center">
      <div ref={cardRef} className="w-full bg-card border border-border rounded-2xl p-8 shadow-sm">
        <div className="flex justify-center mb-6">
          <span className="text-2xl font-bold tracking-wide text-foreground" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            FIKKO
          </span>
        </div>

        {checkEmail ? (
          <p className="text-sm text-center text-muted-foreground">
            Check <span className="font-semibold text-foreground">{email}</span> for a confirmation link to finish
            signing up.
          </p>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldCls}
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldCls}
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="mt-1 px-3 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-60"
              >
                {mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>

            <div className="flex items-center gap-2 my-4 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or
              <div className="h-px flex-1 bg-border" />
            </div>

            <button
              onClick={handleGoogle}
              className="w-full px-3 py-2 rounded-xl text-sm font-semibold border border-gray-300 bg-white text-black hover:bg-gray-50 transition-all"
            >
              Continue with Google
            </button>

            <button
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
              }}
              className="mt-4 w-full text-xs text-center text-muted-foreground"
            >
              {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </>
        )}
      </div>
      </div>

      {/* Bottom row: balances the top row so the card stays centred. Holds the
          testimonial loop at the very bottom when there is room for it; bleeds
          past the page padding so it runs edge to edge. */}
      <div className="self-end min-w-0 -mx-4 -mb-4">
        {fit.testimonials && <TestimonialLoop />}
      </div>
    </div>
  );
}
