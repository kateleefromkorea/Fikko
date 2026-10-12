import { Suspense, lazy, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, LogOut, Settings, Users, type LucideIcon } from "lucide-react";
import type { DeviceOutcome } from "@/components/profile/DevicesCard";
import type { ProfileRow } from "@/hooks/useProfile";
import ScreenTitle from "@/phone/ScreenTitle";

const ProfileView = lazy(() => import("@/components/ProfileView"));
const CommunityView = lazy(() => import("@/components/CommunityView"));

export type YouPage = "settings" | "community";
const PAGE_TITLE: Record<YouPage, string> = { settings: "Profile & settings", community: "Community" };

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
 * Everything about you, opened from the profile button in the top bar: your
 * profile and settings, and the community. Each opens as its own page with a
 * back button, the way settings work on a phone. (Your plant has its own tab.)
 */
export default function YouScreen({
  page, onPage, userId, email, profile, onUpdateProfile, onSignOut, deviceOutcome = null, onDevicesSynced, siteOrigin = "",
}: {
  page: YouPage | null;
  onPage: (p: YouPage | null) => void;
  userId: string;
  email: string;
  profile: ProfileRow;
  onUpdateProfile: (patch: Partial<ProfileRow>) => Promise<void>;
  onSignOut: () => void;
  /** How connecting a wearable went, shown in Profile & settings. */
  deviceOutcome?: DeviceOutcome | null;
  onDevicesSynced: () => void;
  /** Where the website lives, for the Help, Privacy and Terms links. */
  siteOrigin?: string;
}) {
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
