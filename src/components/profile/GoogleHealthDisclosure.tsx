import { ShieldCheck } from "lucide-react";

/**
 * Shown next to every "Connect Fitbit / Pixel Watch" button, before Google's
 * consent screen. Google requires this disclosure inside the app, in normal
 * use, naming what is accessed, why, and who it is shared with.
 */
export default function GoogleHealthDisclosure() {
  return (
    <div className="flex gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm text-muted-foreground">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <p>
        Fikko collects your health and fitness data from Google (sleep, heart rate, HRV, breathing rate, body
        temperature, blood oxygen, steps, active minutes, calories and VO₂ max) to show your trends and fill in your
        daily habits. It is read-only, never sold, never used for ads, and never sent to our AI features. Fikko's use of
        information received from Google APIs adheres to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. See our{" "}
        <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}
