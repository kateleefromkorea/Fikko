/** The card's headline: minutes against the goal, with the day's calories burned under it. */
export default function ActivityTotals({ minutes, kcal, estimated }: { minutes: number; kcal: number; estimated: boolean }) {
  return (
    <div className="text-right">
      <p className="text-4xl font-semibold tracking-tight tabular-nums">
        {minutes}
        <span className="ml-1 text-sm font-normal tracking-normal text-muted-foreground">min</span>
      </p>
      {kcal > 0 && (
        <p className="mt-0.5 text-sm whitespace-nowrap text-muted-foreground tabular-nums" title={estimated ? "Partly estimated" : undefined}>
          {estimated && "≈ "}<span className="font-semibold text-foreground">{kcal.toLocaleString()}</span> kcal<span className="hidden sm:inline"> burned</span>
        </p>
      )}
    </div>
  );
}
