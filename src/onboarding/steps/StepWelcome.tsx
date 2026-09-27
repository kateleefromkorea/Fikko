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

      <ul className="flex flex-col gap-3">
        {VALUE_PROPS.map((v) => (
          <li key={v.title} className="flex items-start gap-4 rounded-lg border p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary" aria-hidden="true">
              <v.icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{v.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{v.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-sm text-muted-foreground">
        Your answers stay in your own account and are only used to work out your targets.
      </p>
    </div>
  );
}
