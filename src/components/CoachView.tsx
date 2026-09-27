import { useState } from "react";
import PageHeader from "./PageHeader";

interface Coach {
  id: string;
  name: string;
  title: string;
  specialities: string[];
  rating: number;
  reviews: number;
  sessions: string;
  availability: string;
  initials: string;
  bio: string;
  price: string;
  languages: string[];
  badge?: string;
  avatarColor?: string;
}

const COACHES: Coach[] = [
  {
    id: "1", name: "Dr. Priya Menon", title: "Certified Nutritionist & Wellness Coach",
    specialities: ["Weight management", "Gut health", "Meal planning"],
    rating: 4.9, reviews: 214, sessions: "1,200+", availability: "Next: Tomorrow",
    initials: "PM", price: "$85/session", languages: ["English", "Hindi"],
    badge: "Top rated", avatarColor: "rgba(245,166,35,0.18)",
    bio: "Specialises in sustainable nutrition strategies with a focus on whole-food approaches and long-term lifestyle change. Former NHS dietitian with 12 years of clinical experience.",
  },
  {
    id: "2", name: "James Okafor", title: "Strength & Conditioning Coach",
    specialities: ["Muscle building", "Injury recovery", "HIIT"],
    rating: 4.8, reviews: 178, sessions: "950+", availability: "Next: Today",
    initials: "JO", price: "$70/session", languages: ["English"],
    avatarColor: "rgba(255,117,117,0.18)",
    bio: "Former professional athlete turned coach. Builds personalised training plans for all fitness levels with a data-driven approach. BSc Sports Science, NSCA-CSCS certified.",
  },
  {
    id: "3", name: "Sofia Andersson", title: "Sleep & Mindfulness Coach",
    specialities: ["Sleep hygiene", "Stress reduction", "Breathwork"],
    rating: 4.9, reviews: 302, sessions: "1,800+", availability: "Next: Thu",
    initials: "SA", price: "$90/session", languages: ["English", "Swedish"],
    badge: "Most booked", avatarColor: "rgba(143,169,224,0.3)",
    bio: "Helps clients reclaim restorative sleep and manage chronic stress through evidence-based mindfulness and CBT-I techniques. Certified by the Sleep Foundation.",
  },
  {
    id: "4", name: "Marcus Webb", title: "Holistic Health & Habit Coach",
    specialities: ["Habit formation", "Accountability", "Mental fitness"],
    rating: 4.7, reviews: 139, sessions: "700+", availability: "Next: Fri",
    initials: "MW", price: "$65/session", languages: ["English"],
    avatarColor: "rgba(21,121,84,0.18)",
    bio: "Combines behavioural science with motivational coaching to help clients build sustainable daily routines that stick. ICF-certified coach and certified habit strategist.",
  },
  {
    id: "5", name: "Aisha Rahman", title: "Women's Health & Hormonal Wellness Coach",
    specialities: ["Hormonal health", "Prenatal wellness", "Energy balance"],
    rating: 4.9, reviews: 188, sessions: "880+", availability: "Next: Wed",
    initials: "AR", price: "$95/session", languages: ["English", "Urdu"],
    badge: "New", avatarColor: "rgba(255,179,193,0.35)",
    bio: "Specialises in hormonal health across all life stages — from cycle syncing to perimenopause. Integrates nutrition, movement, and mindset for whole-body balance.",
  },
  {
    id: "6", name: "Luca Ferretti", title: "Performance & Recovery Coach",
    specialities: ["Athletic recovery", "Cold therapy", "Longevity"],
    rating: 4.8, reviews: 97, sessions: "520+", availability: "Next: Mon",
    initials: "LF", price: "$80/session", languages: ["English", "Italian"],
    avatarColor: "rgba(45,196,178,0.2)",
    bio: "Trained with elite endurance athletes across Europe. Focuses on optimising recovery, reducing inflammation, and extending healthspan through science-backed protocols.",
  },
  {
    id: "7", name: "Kezia Thomas", title: "Mental Health & Emotional Wellness Coach",
    specialities: ["Anxiety management", "Self-compassion", "Journaling"],
    rating: 4.8, reviews: 241, sessions: "1,100+", availability: "Next: Tomorrow",
    initials: "KT", price: "$75/session", languages: ["English"],
    avatarColor: "rgba(126,220,206,0.25)",
    bio: "Bridges the gap between coaching and mental wellness. Trained in positive psychology and somatic practices, helping clients move from surviving to thriving.",
  },
  {
    id: "8", name: "Daniel Park", title: "Metabolic Health & Longevity Coach",
    specialities: ["Blood sugar", "Fasting protocols", "Biohacking"],
    rating: 4.7, reviews: 112, sessions: "600+", availability: "Next: Sat",
    initials: "DP", price: "$100/session", languages: ["English", "Korean"],
    avatarColor: "rgba(91,169,240,0.3)",
    bio: "Focuses on metabolic optimisation through continuous glucose monitoring, time-restricted eating, and personalised supplementation. Works with clients on 3–6 month transformation programmes.",
  },
];

const FILTERS = ["All", "Nutrition", "Fitness", "Sleep", "Mindfulness", "Habits", "Women's health", "Recovery", "Mental health", "Longevity"];
const SORT_OPTIONS = ["Top rated", "Most reviewed", "Price: low–high", "Price: high–low", "Availability"];

const BADGE_STYLES: Record<string, { background: string; color: string }> = {
  "Top rated": { background: "rgba(245,166,35,0.18)", color: "#b06800" },
  "Most booked": { background: "rgba(21,121,84,0.15)", color: "var(--primary)" },
  "New": { background: "rgba(45,196,178,0.18)", color: "#1a8a7e" },
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} className="w-3.5 h-3.5" viewBox="0 0 16 16" fill={s <= Math.round(rating) ? "var(--amber)" : "var(--border)"}>
          <path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z" />
        </svg>
      ))}
    </div>
  );
}

export default function CoachView() {
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("Top rated");
  const [search, setSearch] = useState("");
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  const request = (id: string) => setRequested((prev) => new Set([...prev, id]));

  const filtered = COACHES
    .filter((c) => {
      const q = search.toLowerCase();
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.title.toLowerCase().includes(q) || c.specialities.some((s) => s.toLowerCase().includes(q));
      const matchFilter = filter === "All" || c.specialities.some((s) => s.toLowerCase().includes(filter.toLowerCase())) || c.title.toLowerCase().includes(filter.toLowerCase());
      return matchSearch && matchFilter;
    })
    .sort((a, b) => {
      if (sort === "Top rated") return b.rating - a.rating;
      if (sort === "Most reviewed") return b.reviews - a.reviews;
      if (sort === "Price: low–high") return parseInt(a.price.replace(/\D/g, "")) - parseInt(b.price.replace(/\D/g, ""));
      if (sort === "Price: high–low") return parseInt(b.price.replace(/\D/g, "")) - parseInt(a.price.replace(/\D/g, ""));
      return 0;
    });

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        title="Find a Health Coach"
        subtitle="Sample coaches shown for preview — booking isn't live yet."
        badge={
          <span className="text-xs px-2 py-1 rounded-full font-bold bg-secondary text-secondary-foreground">
            Coming soon
          </span>
        }
      />

      {/* Search + sort bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-60">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, speciality, or keyword…"
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-border text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          />
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="px-4 py-3 rounded-xl border border-border text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer appearance-none"
        >
          {SORT_OPTIONS.map((o) => <option key={o}>{o}</option>)}
        </select>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all capitalize"
            style={filter === f
              ? { background: "var(--primary)", color: "var(--primary-foreground)" }
              : { background: "var(--secondary)", color: "var(--secondary-foreground)" }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">{filtered.length} coach{filtered.length !== 1 ? "es" : ""} found</p>

      {/* Coach grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-20 text-center">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-muted-foreground text-sm">No coaches match your search.</p>
          <button onClick={() => { setSearch(""); setFilter("All"); }} className="mt-3 text-xs text-primary underline">Clear filters</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {filtered.map((coach) => {
            const booked = requested.has(coach.id);
            const open = expanded === coach.id;
            return (
              <div key={coach.id} className="rounded-2xl border border-border bg-card flex flex-col overflow-hidden transition-all hover:shadow-md" style={{ boxShadow: "0 2px 12px rgba(21,121,84,0.06)" }}>
                {/* Card body */}
                <div className="p-5 flex flex-col gap-4 flex-1">
                  {/* Avatar + badge + name */}
                  <div className="flex items-start gap-3">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-extrabold text-foreground flex-shrink-0"
                      style={{ background: coach.avatarColor ?? "var(--secondary)" }}
                    >
                      {coach.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-foreground text-sm leading-tight">{coach.name}</h4>
                        {coach.badge && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-semibold"
                            style={BADGE_STYLES[coach.badge] ?? { background: "var(--secondary)", color: "var(--secondary-foreground)" }}
                          >
                            {coach.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{coach.title}</p>
                    </div>
                  </div>

                  {/* Bio — expandable */}
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {open ? coach.bio : coach.bio.slice(0, 90) + (coach.bio.length > 90 ? "…" : "")}
                    {coach.bio.length > 90 && (
                      <button onClick={() => setExpanded(open ? null : coach.id)} className="ml-1 text-primary underline transition-all">
                        {open ? "less" : "more"}
                      </button>
                    )}
                  </p>

                  {/* Specialities */}
                  <div className="flex flex-wrap gap-1.5">
                    {coach.specialities.map((s) => (
                      <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-secondary border border-border text-secondary-foreground">{s}</span>
                    ))}
                  </div>

                  {/* Rating + sessions */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <StarRating rating={coach.rating} />
                    <span className="font-bold text-foreground">{coach.rating}</span>
                    <span>({coach.reviews} reviews)</span>
                    <span>·</span>
                    <span>{coach.sessions} sessions</span>
                  </div>

                  {/* Languages */}
                  <p className="text-xs text-muted-foreground">Speaks: {coach.languages.join(", ")}</p>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-border bg-muted flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold text-foreground">{coach.price}</p>
                    <p className="text-xs text-muted-foreground">{coach.availability}</p>
                  </div>
                  <button
                    onClick={() => request(coach.id)}
                    disabled={booked}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex-shrink-0"
                    style={booked
                      ? { background: "var(--secondary)", color: "var(--muted-foreground)" }
                      : { background: "var(--primary)", color: "var(--primary-foreground)" }}
                  >
                    {booked ? "Requested ✓" : "Book session"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
