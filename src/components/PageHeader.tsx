import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  action?: ReactNode;
}

export default function PageHeader({ title, subtitle, badge, action }: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-2 text-base text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
