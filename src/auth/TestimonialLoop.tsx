import { IS_SAMPLE, TESTIMONIALS, type Testimonial } from "./mockTestimonials";

// Fixed height so the sign-in layout can reserve exactly this much space
// below the card without measuring. Includes the sample-reviews label row.
const LABEL_HEIGHT = 24;
export const TESTIMONIAL_STRIP_HEIGHT = 136 + (IS_SAMPLE ? LABEL_HEIGHT : 0);

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden="true" style={{ color: i <= rating ? "#FFD166" : "rgba(255,255,255,0.25)" }}>
          ★
        </span>
      ))}
    </div>
  );
}

function Card({ t }: { t: Testimonial }) {
  return (
    <figure
      className="flex-shrink-0 w-72 h-[112px] rounded-2xl px-4 py-3 flex flex-col justify-between"
      style={{
        background: "rgba(255, 255, 255, 0.1)",
        border: "1px solid rgba(255, 255, 255, 0.18)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <Stars rating={t.rating} />
        <figcaption className="text-xs font-semibold truncate" style={{ color: "rgba(255,255,255,0.9)" }}>
          {t.name} <span style={{ color: "rgba(255,255,255,0.55)" }}>· {t.detail}</span>
        </figcaption>
      </div>
      <blockquote className="text-sm leading-snug line-clamp-3" style={{ color: "rgba(255,255,255,0.88)" }}>
        “{t.quote}”
      </blockquote>
    </figure>
  );
}

/**
 * An endlessly scrolling row of testimonials. The list is rendered twice and
 * the track slides by exactly one copy's width, so the loop is seamless. The
 * second copy is hidden from screen readers so each quote is read once.
 */
export default function TestimonialLoop() {
  return (
    <section
      aria-label={IS_SAMPLE ? "Sample reviews (illustrative, not from real customers)" : "What people say about Fikko"}
      style={{ height: TESTIMONIAL_STRIP_HEIGHT }}
    >
      {IS_SAMPLE && (
        // Outside the faded, scrolling area so it stays readable and still.
        <p
          className="flex items-center justify-center text-xs font-semibold"
          style={{ height: LABEL_HEIGHT, color: "rgba(255, 255, 255, 0.75)", fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          Sample reviews · for illustration, not from real customers
        </p>
      )}
      <div className="testimonial-loop w-full overflow-hidden py-3" style={{ height: 136 }}>
      <div className="testimonial-track flex w-max gap-4">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex gap-4" aria-hidden={copy === 1 ? true : undefined}>
            {TESTIMONIALS.map((t) => <Card key={`${copy}-${t.name}`} t={t} />)}
          </div>
        ))}
      </div>
      </div>
    </section>
  );
}
