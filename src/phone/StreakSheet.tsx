import { CloudRain, Flame } from "lucide-react";
import { MAX_RAIN_CLOUDS, RAIN_CLOUD_EVERY, type Growth } from "@/lib/fikko";
import { cn } from "@/lib/utils";
import Sheet from "@/phone/Sheet";

/**
 * What the streak and the rain clouds above the plant mean, opened by tapping
 * either. Says how each is earned and how close the next rain cloud is.
 */
export default function StreakSheet({ open, onClose, growth }: { open: boolean; onClose: () => void; growth: Growth }) {
  const { streak, rainClouds, toNextRainCloud } = growth;
  const full = rainClouds >= MAX_RAIN_CLOUDS;
  const towardsNext = RAIN_CLOUD_EVERY - toNextRainCloud;

  return (
    <Sheet open={open} onClose={onClose} title="Streak and rain clouds">
      <div className="space-y-4 pb-2">
        <section className="flex gap-3.5 rounded-2xl bg-[#FFF4EA] p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-[#E0782F] shadow-sm" aria-hidden="true">
            <Flame className="size-6" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold">
              {streak > 0 ? `${streak} ${streak === 1 ? "day" : "days"} in a row` : "No streak yet"}
            </h3>
            <p className="mt-1 text-sm text-foreground/75">
              {streak > 0
                ? "Days in a row with every habit done. Today joins once you finish your last habit."
                : "Finish every habit today to start one. Each day in a row helps your plant grow."}
            </p>
          </div>
        </section>

        <section className="flex gap-3.5 rounded-2xl bg-[#E6F1FC] p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-[#1F73C2] shadow-sm" aria-hidden="true">
            <CloudRain className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold">
              Rain clouds: {rainClouds} of {MAX_RAIN_CLOUDS}
            </h3>
            <p className="mt-1 text-sm text-foreground/75">
              Every {RAIN_CLOUD_EVERY} full days in a row earns one. If you miss a day, a cloud waters your plant for you,
              so your streak and plant stay safe.
            </p>

            <div className="mt-3 flex gap-1.5" aria-hidden="true">
              {Array.from({ length: MAX_RAIN_CLOUDS }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "grid size-8 place-items-center rounded-full",
                    i < rainClouds ? "bg-white text-[#1F73C2] shadow-sm" : "border border-dashed border-[#1F73C2]/30 text-[#1F73C2]/30",
                  )}
                >
                  <CloudRain className="size-4" />
                </span>
              ))}
            </div>

            <p className="mt-3 text-sm font-medium text-[#1F73C2]">
              {full
                ? `You're holding the most you can keep (${MAX_RAIN_CLOUDS}).`
                : `Next cloud in ${toNextRainCloud} full ${toNextRainCloud === 1 ? "day" : "days"}`}
            </p>
            {!full && (
              <div
                role="progressbar"
                aria-label="Progress to your next rain cloud"
                aria-valuemin={0}
                aria-valuemax={RAIN_CLOUD_EVERY}
                aria-valuenow={towardsNext}
                className="mt-2 flex gap-1"
              >
                {Array.from({ length: RAIN_CLOUD_EVERY }, (_, i) => (
                  <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < towardsNext ? "bg-[#1F73C2]" : "bg-[#1F73C2]/15")} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </Sheet>
  );
}
