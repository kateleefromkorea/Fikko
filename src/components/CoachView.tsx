import { Compass, Dumbbell, Moon, Salad, type LucideIcon } from "lucide-react";
import PageHeader from "./PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Coaching isn't live yet. This page used to list sample coaches with invented
// names, credentials, ratings and review counts; it now describes what's
// planned instead, so nothing here reads as a real professional or a real
// review. Replace with real, verified coach profiles when booking launches.

const PLANNED: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Salad, title: "Nutrition & meal planning", body: "Work with a qualified nutrition coach on sustainable eating habits." },
  { icon: Dumbbell, title: "Strength & conditioning", body: "Training plans built around your goals and your week." },
  { icon: Moon, title: "Sleep & stress", body: "Practical routines for better rest and a calmer day." },
  { icon: Compass, title: "Habits & accountability", body: "Regular check-ins to help the habits you log in Fikko stick." },
];

export default function CoachView() {
  return (
    <div className="space-y-10">
      <PageHeader
        title="Health coaching"
        subtitle="One-to-one coaching is coming to Fikko."
        badge={<Badge variant="outline" className="h-6 border-teal/40 bg-teal/5 px-2.5 text-primary">Coming soon</Badge>}
      />

      <Card className="gap-8 [--card-spacing:--spacing(8)]">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">What we're planning</CardTitle>
          <CardDescription className="text-base">
            Coaches will be able to see the habits you choose to share, so sessions start from your real data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {PLANNED.map((p) => (
              <div key={p.title} className="flex items-start gap-4 rounded-lg border p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/8" aria-hidden="true">
                  <p.icon className="size-5 text-primary" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{p.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
