import { Star } from "lucide-react";
import { TESTIMONIALS, type Testimonial } from "./testimonials";

// Fixed height so the sign-in layout can reserve exactly this much space
// below the card without measuring.
export const TESTIMONIAL_STRIP_HEIGHT = 136;

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={i <= rating ? "size-3.5 fill-sage text-evergreen" : "size-3.5 text-border"}
        />
      ))}
    </div>
  );
}

function Card({ t }: { t: Testimonial }) {
  return (
    <figure className="flex h-[112px] w-72 shrink-0 flex-col justify-between rounded-xl border bg-card/80 px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <Stars rating={t.rating} />
        <figcaption className="truncate text-xs font-medium">
          {t.name} <span className="text-muted-foreground">· {t.detail}</span>
        </figcaption>
      </div>
      <blockquote className="line-clamp-3 text-sm leading-snug text-muted-foreground">“{t.quote}”</blockquote>
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
    <section aria-label="What people say about Fikko" style={{ height: TESTIMONIAL_STRIP_HEIGHT }}>
      <div className="testimonial-loop w-full overflow-hidden py-3" style={{ height: TESTIMONIAL_STRIP_HEIGHT }}>
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
