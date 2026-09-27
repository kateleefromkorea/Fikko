import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SetupNeeded() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md gap-4 [--card-spacing:--spacing(8)]">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Supabase isn't configured yet</CardTitle>
          <CardDescription>
            Copy <code className="rounded bg-muted px-1">.env.example</code> to{" "}
            <code className="rounded bg-muted px-1">.env.local</code> and fill in your Supabase project's URL and anon
            key, then restart the dev server.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Run the SQL in <code className="rounded bg-muted px-1">src/db/schema.sql</code> in your Supabase project's
          SQL editor first, if you haven't already.
        </CardContent>
      </Card>
    </div>
  );
}
