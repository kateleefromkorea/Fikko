// Profile → Privacy: the optional AI consent, which can be switched off and on
// at any time, and a record of what the member agreed to. Required consents
// can only be withdrawn by deleting the account.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useConsents } from "../../hooks/useConsents";
import { REGION_NAMES, type Region } from "../../lib/consent";

export default function PrivacyCard({ userId }: { userId: string }) {
  const { consents, region, loading, save } = useConsents(userId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ai = !!consents.ai_processing?.granted;
  const agreed = consents.terms?.granted ? consents.terms : null;
  const noticeRegion = (agreed?.region ?? region) as Region;

  async function toggleAi(on: boolean) {
    setSaving(true);
    setError(null);
    try {
      await save(noticeRegion, { ai_processing: on });
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="gap-6 [--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Privacy</CardTitle>
        <CardDescription>Your choices about how Fikko uses your data.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-4 rounded-lg border px-4 py-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="ai-consent" className="text-sm font-medium">AI features</label>
            <p className="mt-0.5 text-sm text-muted-foreground">
              The coach, voice check-ins, photo logging and the AI medication check send the data they need to
              Anthropic in the United States. Anthropic deletes it within 30 days and doesn't train on it.
            </p>
          </div>
          {saving ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving" />
          ) : (
            <Switch id="ai-consent" checked={ai} disabled={loading} onCheckedChange={(v) => void toggleAi(v)} />
          )}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        {agreed && (
          <p className="text-sm text-muted-foreground">
            You agreed to the privacy notice for {REGION_NAMES[noticeRegion] ?? "your region"} on{" "}
            {new Date(agreed.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}.
            Health data, storage and your account details are needed to run Fikko, so to withdraw those, delete your
            account below.{" "}
            <a href="/privacy.html" target="_blank" rel="noreferrer" className="text-primary-ink underline">Privacy Policy</a>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
