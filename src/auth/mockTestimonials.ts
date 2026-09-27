// ⚠️ MOCK DATA — placeholder testimonials for the login page.
// These are invented, not from real customers. They are shown live only
// because IS_SAMPLE labels them as sample reviews on screen: presenting
// made-up reviews as genuine would mislead customers (and in the US violates
// the FTC's rule on fake reviews and testimonials). When real, permissioned
// feedback replaces them, set IS_SAMPLE to false.

export interface Testimonial {
  name: string;
  detail: string;
  rating: 1 | 2 | 3 | 4 | 5;
  quote: string;
}

/** Whether the testimonial loop renders at all. */
export const SHOW_TESTIMONIALS = true;

/**
 * True while the entries below are invented. Keeps a visible "Sample reviews"
 * label on the strip. Only set this to false once every entry is a real
 * customer's feedback, used with their permission.
 */
export const IS_SAMPLE = true;

export const TESTIMONIALS: Testimonial[] = [
  { name: "Maya R.", detail: "3 months on Fikko", rating: 5, quote: "Finally one app for water, sleep and meals. No ads, no clutter — I actually open it every day." },
  { name: "Daniel K.", detail: "Training for a half marathon", rating: 5, quote: "The calorie target it worked out for me was spot on. Down 4 kg without feeling starved." },
  { name: "Priya S.", detail: "New to tracking", rating: 4, quote: "Logging food is quick once you've saved your usual meals. Would love barcode scanning next." },
  { name: "Tom W.", detail: "6 weeks on Fikko", rating: 5, quote: "The medication schedule alone is worth it. Morning, midday and night all in one place." },
  { name: "Aisha B.", detail: "Busy parent", rating: 5, quote: "Two minutes a day and I can see how I'm really doing. The mood tracker surprised me." },
  { name: "Leo M.", detail: "Strength training", rating: 4, quote: "Clean, fast and genuinely ad-free. The dashboard charts make my progress obvious." },
];
