import PageHeader from "./PageHeader";

// Coaching isn't live yet. This page used to list sample coaches with invented
// names, credentials, ratings and review counts; it now describes what's
// planned instead, so nothing here reads as a real professional or a real
// review. Replace with real, verified coach profiles when booking launches.

const PLANNED = [
  { icon: "🥗", title: "Nutrition & meal planning", body: "Work with a qualified nutrition coach on sustainable eating habits." },
  { icon: "💪", title: "Strength & conditioning", body: "Training plans built around your goals and your week." },
  { icon: "🌙", title: "Sleep & stress", body: "Practical routines for better rest and a calmer day." },
  { icon: "🧭", title: "Habits & accountability", body: "Regular check-ins to help the habits you log in Fikko stick." },
];

export default function CoachView() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Health Coaching"
        subtitle="One-to-one coaching is coming to Fikko."
        badge={
          <span className="text-xs px-2 py-1 rounded-full font-bold bg-secondary text-secondary-foreground">
            Coming soon
          </span>
        }
      />

      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <h3 className="font-extrabold text-foreground text-lg">What we're planning</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Coaches will be able to see the habits you choose to share, so sessions start from your real data.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
          {PLANNED.map((p) => (
            <div key={p.title} className="rounded-xl border border-border bg-muted p-4 flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 bg-card">{p.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">{p.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
