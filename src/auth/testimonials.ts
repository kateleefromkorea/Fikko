// Customer testimonials for the login page.
//
// Only add real feedback from real customers, used with their permission and
// quoted accurately. Presenting invented reviews as genuine misleads customers
// (and in the US violates the FTC's rule on fake reviews and testimonials).
// While this list is empty the testimonial strip doesn't render at all.

export interface Testimonial {
  name: string;
  detail: string;
  rating: 1 | 2 | 3 | 4 | 5;
  quote: string;
}

export const TESTIMONIALS: Testimonial[] = [];

/** The strip only renders once there are real testimonials to show. */
export const SHOW_TESTIMONIALS = TESTIMONIALS.length > 0;
