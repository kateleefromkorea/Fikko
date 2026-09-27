import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  action?: ReactNode;
}

// Sits directly on the dark page gradient with no panel, so text is white.
export default function PageHeader({ title, subtitle, badge, action }: Props) {
  return (
    <div className="px-1 py-2 sm:py-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight">
              {title}
            </h2>
            {badge}
          </div>
          {subtitle && <p className="text-white/75 text-sm mt-1.5">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
