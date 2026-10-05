import { ChartColumn, Sprout, Utensils } from "lucide-react";
import { StepHeading } from "../ui";

const VALUE_PROPS = [
  {
    icon: Sprout,
    title: "Whole-person health",
    body: "Water, sleep, movement, mood and medication, all in one place instead of five apps.",
  },
  {
    icon: Utensils,
    title: "Smart nutrition tracking",
    body: "Search a real food database, log a meal in seconds, and save the foods you eat often.",
  },
  {
    icon: ChartColumn,
    title: "A plan built from your numbers",
    body: "We work out your daily calorie target from your own body and goals, not a generic default.",
  },
];

export default function StepWelcome({ name }: { name: string }) {
  return (
    <div>
      <StepHeading
        title={name ? `Welcome, ${name.split(/\s+/)[0]}.` : "Welcome to Fikko."}
        subtitle="Six quick questions and your dashboard is set up around you. It takes about a minute."
      />

      {/* One information panel, not a list of tiles, so nothing here looks like a choice to tap. */}
      <section aria-labelledby="welcome-what" className="rounded-xl bg-muted/50 p-5 sm:p-6">
        <h3 id="welcome-what" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          What you get
        </h3>
        <ul className="mt-4 divide-y divide-foreground/10">
          {VALUE_PROPS.map((v) => (
            <li key={v.title} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <v.icon className="mt-0.5 size-5 shrink-0 text-primary-ink" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{v.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{v.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-sm text-muted-foreground">
        Your answers stay in your own account and are only used to work out your targets.
      </p>
    </div>
  );
}
