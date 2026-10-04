// Asks members who haven't agreed to the current privacy notice (they joined
// before it existed, or the policy changed) to review it. It can't be
// dismissed: the app stays behind it until they agree.

import ConsentForm from "./ConsentForm";
import type { ConsentKey, Region } from "../lib/consent";

interface Props {
  region: Region;
  aiGranted: boolean;
  onSave: (region: Region, choices: Record<ConsentKey, boolean>) => Promise<void>;
}

export default function ConsentPrompt({ region, aiGranted, onSave }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Review Fikko's privacy notice"
        className="max-h-[94vh] w-full overflow-y-auto rounded-t-2xl bg-card px-6 py-8 shadow-xl ring-1 ring-foreground/10 sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl sm:px-8"
      >
        <ConsentForm
          initialRegion={region}
          initialAi={aiGranted}
          title="We've updated how we ask for your consent"
          subtitle="To keep using Fikko, please review what we collect, why, and where it's kept, and tick what you agree to."
          submitLabel="Agree and continue"
          onSubmit={onSave}
        />
      </div>
    </div>
  );
}
