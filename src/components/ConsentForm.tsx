// The privacy consent form, shared by onboarding and the one-off prompt for
// members who joined before it existed (or before a policy change). Each
// consent is a separate box, as Korea's PIPA requires; "Agree to all" is only a
// shortcut that ticks them. The notice above them follows the member's country.

import { useState } from "react";
import { ChevronDown, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  CONSENT_ITEMS, REGION_NAMES, REGION_NOTES, type ConsentKey, type Region,
} from "../lib/consent";

const REGION_ORDER: Region[] = ["AU", "KR", "SG", "US", "OTHER"];
const selectCls =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

interface Props {
  /** The country Fikko detected; the member can change it. */
  initialRegion: Region;
  /** Starting answer for the optional AI consent, e.g. what they chose last time. */
  initialAi?: boolean;
  title: string;
  subtitle: string;
  submitLabel: string;
  onSubmit: (region: Region, choices: Record<ConsentKey, boolean>) => Promise<void>;
  /** Extra controls beside the submit button, such as Back. */
  secondary?: React.ReactNode;
}

export default function ConsentForm({ initialRegion, initialAi = false, title, subtitle, submitLabel, onSubmit, secondary }: Props) {
  const [region, setRegion] = useState<Region>(initialRegion);
  const [checked, setChecked] = useState<Record<ConsentKey, boolean>>({
    terms: false, personal_info: false, health_data: false, overseas_transfer: false, ai_processing: initialAi,
  });
  const [open, setOpen] = useState<ConsentKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const allChecked = CONSENT_ITEMS.every((c) => checked[c.key]);
  const missingRequired = CONSENT_ITEMS.some((c) => c.required && !checked[c.key]);
  const korean = region === "KR";

  const setAll = (v: boolean) =>
    setChecked({ terms: v, personal_info: v, health_data: v, overseas_transfer: v, ai_processing: v });

  async function submit() {
    if (missingRequired) {
      setError("Please agree to the required items to continue.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit(region, checked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save your choices. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="size-6 text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <label className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
        Where do you live?
        <select value={region} onChange={(e) => setRegion(e.target.value as Region)} className={selectCls}>
          {REGION_ORDER.map((r) => <option key={r} value={r}>{REGION_NAMES[r]}</option>)}
        </select>
      </label>

      <div className="mt-3 space-y-2 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
        {REGION_NOTES[region].map((note) => <p key={note}>{note}</p>)}
      </div>

      <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
        <Checkbox checked={allChecked} onCheckedChange={(v) => setAll(v === true)} />
        <span className="text-sm font-semibold">
          Agree to all, including the optional AI features
          {korean && <span className="block text-xs font-normal text-muted-foreground">전체 동의 (선택 항목 포함)</span>}
        </span>
      </label>

      <ul className="mt-3 divide-y divide-foreground/10 rounded-xl border">
        {CONSENT_ITEMS.map((c) => (
          <li key={c.key} className="px-4 py-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id={`consent-${c.key}`}
                checked={checked[c.key]}
                onCheckedChange={(v) => setChecked((p) => ({ ...p, [c.key]: v === true }))}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <label htmlFor={`consent-${c.key}`} className="cursor-pointer text-sm">
                  <span className={cn("mr-1.5 text-xs font-semibold", c.required ? "text-primary" : "text-muted-foreground")}>
                    {c.required ? "Required" : "Optional"}
                  </span>
                  {c.title}
                </label>
                {korean && <p className="mt-0.5 text-xs text-muted-foreground">{c.ko}</p>}
                {c.key === "terms" && (
                  <p className="mt-1 text-xs">
                    <a href="/terms.html" target="_blank" rel="noreferrer" className="text-primary underline">Terms of Use</a>
                    {" · "}
                    <a href="/privacy.html" target="_blank" rel="noreferrer" className="text-primary underline">Privacy Policy</a>
                  </p>
                )}
                {c.details.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setOpen((o) => (o === c.key ? null : c.key))}
                      aria-expanded={open === c.key}
                      className="mt-1 flex items-center gap-1 text-xs text-primary"
                    >
                      {open === c.key ? "Hide details" : "See details"}
                      <ChevronDown className={cn("size-3.5 transition-transform", open === c.key && "rotate-180")} aria-hidden="true" />
                    </button>
                    {open === c.key && (
                      <dl className="mt-2 space-y-1.5 text-xs">
                        {c.details.map((d) => (
                          <div key={d.label}>
                            <dt className="font-medium">{d.label}</dt>
                            <dd className="text-muted-foreground">{d.text}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-6 flex items-center gap-2">
        {secondary}
        <Button onClick={submit} disabled={saving} className="h-10 flex-1">
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Saving…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
