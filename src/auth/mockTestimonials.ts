// ⚠️ MOCK DATA — placeholder testimonials for designing the login page.
// These are invented, not from real customers. Do not show them on the live
// site: presenting made-up reviews as genuine misleads customers (and in the
// US violates the FTC's rule on fake reviews and testimonials). Replace them
// with real, permissioned feedback, then flip SHOW_TESTIMONIALS below.

export interface Testimonial {
  name: string;
  detail: string;
  rating: 1 | 2 | 3 | 4 | 5;
  quote: string;
}

/**
 * Whether the testimonial loop renders. While the entries are mock data this
 * is on for local development only; production builds leave it off.
 */
export const SHOW_TESTIMONIALS = import.meta.env.DEV;

// Emptied in production builds so the mock quotes are not even shipped.
export const TESTIMONIALS: Testimonial[] = !import.meta.env.DEV ? [] : [
  { name: "Maya R.", detail: "3 months on Fikko", rating: 5, quote: "Finally one app for water, sleep and meals. No ads, no clutter — I actually open it every day." },
  { name: "Daniel K.", detail: "Training for a half marathon", rating: 5, quote: "The calorie target it worked out for me was spot on. Down 4 kg without feeling starved." },
  { name: "Priya S.", detail: "New to tracking", rating: 4, quote: "Logging food is quick once you've saved your usual meals. Would love barcode scanning next." },
  { name: "Tom W.", detail: "6 weeks on Fikko", rating: 5, quote: "The medication schedule alone is worth it. Morning, midday and night all in one place." },
  { name: "Aisha B.", detail: "Busy parent", rating: 5, quote: "Two minutes a day and I can see how I'm really doing. The mood tracker surprised me." },
  { name: "Leo M.", detail: "Strength training", rating: 4, quote: "Clean, fast and genuinely ad-free. The dashboard charts make my progress obvious." },
];
