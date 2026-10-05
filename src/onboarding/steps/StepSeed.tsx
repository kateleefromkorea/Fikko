import type { useOnboardingState } from "../useOnboardingState";
import { ErrorText, StepHeading } from "../ui";
import SeedPicker from "../../components/fikko/SeedPicker";
import { CURRENT_PLAN } from "../../lib/fikko";

type Api = ReturnType<typeof useOnboardingState>;

export default function StepSeed({ api, showError }: { api: Api; showError: boolean }) {
  const { state: s, set, errors } = api;
  return (
    <div>
      <StepHeading
        title="Choose your seed"
        subtitle="This is your Fikko. Every day you complete all your habits, it grows a little more. Find it in the My Fikko tab."
      />
      <SeedPicker value={s.seed} onChange={(id) => set("seed", id)} plan={CURRENT_PLAN} />
      {showError && errors[7] && <div className="mt-4"><ErrorText>{errors[7]}</ErrorText></div>}
    </div>
  );
}
