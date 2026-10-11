import { Suspense, lazy, useMemo, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, LogOut, Settings, Users, type LucideIcon } from "lucide-react";
import FikkoPlant from "@/components/fikko/FikkoPlant";
import type { DeviceOutcome } from "@/components/profile/DevicesCard";
import type { ProfileRow } from "@/hooks/useProfile";
import { todayKey } from "@/lib/dates";
import { computeGrowth, seedById, STAGES, type Plan } from "@/lib/fikko";
import type { HabitData } from "@/types";
import ScreenTitle from "@/phone/ScreenTitle";

const MyFikkoView = lazy(() => import("@/components/MyFikkoView"));
const ProfileView = lazy(() => import("@/components/ProfileView"));
const CommunityView = lazy(() => import("@/components/CommunityView"));

export type YouPage = "garden" | "settings" | "community";
const PAGE_TITLE: Record<YouPage, string> = { garden: "My Fikko", settings: "Profile & settings", community: "Community" };

/** The website footer's links, at the bottom of You. */
const LINKS: [string, string][] = [
  ["Help", "/help.html"],
  ["Privacy", "/privacy.html"],
  ["Terms", "/terms.html"],
  ["Food data", "/food-data-sources.html"],
  ["Contact", "mailto:hello@fikko.io"],
];

const loading = <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>;

/**
 * Everything about you: your plant and garden, your profile and settings, and
 * the community. Each opens as its own page with a back button, the way
 * settings work on a phone.
 */
export default function YouScreen({
  page, onPage, userId, email, data, profile, plan, onUpdateProfile, onSignOut, deviceOutcome = null, onDevicesSynced, onOpenToday, siteOrigin = "",
}: {
  page: YouPage | null;
  onPage: (p: YouPage | null) => void;
  userId: string;
  email: string;
  data: HabitData;
  profile: ProfileRow;
  plan: Plan;
  onUpdateProfile: (patch: Partial<ProfileRow>) => Promise<void>;
  onSignOut: () => void;
  /** How connecting a wearable went, shown in Profile & settings. */
  deviceOutcome?: DeviceOutcome | null;
  onDevicesSynced: () => void;
  onOpenToday: () => void;
  /** Where the website lives, for the Help, Privacy and Terms links. */
  siteOrigin?: string;
}) {
  const seed = seedById(profile.fikko_seed);
  const growth = useMemo(
    () => computeGrowth(data, profile.fikko_planted_on ?? todayKey(), profile.water_goal),
    [data, profile.fikko_planted_on, profile.water_goal],
  );

  if (page) {
    return (
      <div className="screen-in">
        <div className="sticky top-0 z-30 -mx-4 mb-4 flex h-[calc(3rem+var(--mobile-top))] items-end bg-background/90 px-2 pb-1 backdrop-blur">
          <button onClick={() => onPage(null)} className="press flex h-10 items-center gap-0.5 rounded-full pr-3 text-[17px] text-primary-ink">
            <ChevronLeft className="size-6" aria-hidden="true" />
            You
          </button>
          <p className="absolute inset-x-24 bottom-3 truncate text-center text-[17px] font-semibold" aria-hidden="true">{PAGE_TITLE[page]}</p>
        </div>
        <Suspense fallback={loading}>
          {page === "garden" && (
            <MyFikkoView userId={userId} data={data} profile={profile} onUpdateProfile={onUpdateProfile} plan={plan} onOpenHabits={onOpenToday} />
          )}
          {page === "settings" && (
            <ProfileView
              email={email}
              profile={profile}
              onUpdateProfile={onUpdateProfile}
              userId={userId}
              onSignOut={onSignOut}
              deviceOutcome={deviceOutcome}
              onDevicesSynced={onDevicesSynced}
            />
          )}
          {page === "community" && <CommunityView userId={userId} profileName={profile.name} />}
        </Suspense>
      </div>
    );
  }

  const initials = (profile.name || email || "?").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="screen-in">
      <ScreenTitle>You</ScreenTitle>

      <div className="mb-6 flex items-center gap-3.5">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary-ink" aria-hidden="true">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{profile.name || "Your account"}</p>
          <p className="truncate text-sm text-muted-foreground">{email}</p>
        </div>
      </div>

      <button
        onClick={() => onPage("garden")}
        className="daily-overview press mb-6 flex w-full items-center gap-4 overflow-hidden rounded-[1.5rem] border border-teal/20 p-4 text-left shadow-sm"
      >
        <span className="size-20 shrink-0" aria-hidden="true">
          <FikkoPlant
            seedId={profile.fikko_seed ?? "sprout"}
            stage={seed ? growth.stage : 0}
            health={seed ? growth.health : "growing"}
            potId={profile.fikko_pot}
            companionId={profile.fikko_companion}
            className="size-full"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold">{seed ? `Your ${seed.name}` : "Plant a seed"}</span>
          <span className="block text-sm text-foreground/70">
            {seed
              ? `${STAGES[growth.stage].name} · ${growth.completeDays} complete ${growth.completeDays === 1 ? "day" : "days"}`
              : "It grows every day you finish your habits"}
          </span>
          <span className="mt-1 block text-sm font-semibold text-primary-ink">Customise and see your garden</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <Group>
        <Item icon={Settings} label="Profile & settings" hint="Goals, devices, medications, reminders, privacy" onClick={() => onPage("settings")} />
        <Item icon={Users} label="Community" hint="Challenges and friends" onClick={() => onPage("community")} />
      </Group>

      <Group>
        <Item icon={LogOut} label="Sign out" onClick={onSignOut} plain />
      </Group>

      <nav aria-label="Help and legal" className="flex flex-wrap justify-center gap-x-5 gap-y-2 px-2 pb-2 text-sm text-muted-foreground">
        {LINKS.map(([label, path]) => (
          <a key={path} href={path.startsWith("mailto:") ? path : siteOrigin + path} className="py-1.5">
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}

function Group({ children }: { children: ReactNode }) {
  return (
    <ul className="mb-6 divide-y divide-ink/8 overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-8px_rgba(16,24,40,0.10)]">
      {children}
    </ul>
  );
}

function Item({ icon: Icon, label, hint, onClick, plain }: { icon: LucideIcon; label: string; hint?: string; onClick: () => void; plain?: boolean }) {
  return (
    <li>
      <button onClick={onClick} className="flex min-h-14 w-full items-center gap-3.5 px-4 py-2.5 text-left active:bg-ink/[0.04]">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-ink" aria-hidden="true">
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium">{label}</span>
          {hint && <span className="block truncate text-[13px] text-muted-foreground">{hint}</span>}
        </span>
        {!plain && <ChevronRight className="size-5 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
      </button>
    </li>
  );
}
