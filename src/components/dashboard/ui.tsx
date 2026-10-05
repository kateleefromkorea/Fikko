import type { ReactNode } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Point } from "../../lib/dashboardStats";

// Chart colours. SVG gradients need literal values, so these mirror the
// habit "-strong" hues and neutrals in index.css (readable as lines on white)
// rather than reading the variables.
export const C = {
  primary: "#165F39",
  teal: "#BCD5AC",
  water: "#165F39",
  meds: "#094217",
  food: "#6A9A5A",
  exercise: "#518F5C",
  sleep: "#042509",
  mood: "#3E7A49",
  grid: "#EBEBEB",
  tick: "#737373",
};

export const ttStyle = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #E5E5E5",
  boxShadow: "0 4px 12px rgba(0,0,0,.06)",
  background: "#fff",
  color: "#171717",
};

export const ax = {
  tick: { fontSize: 11, fill: C.tick },
  axisLine: false as const,
  tickLine: false as const,
};

/** Recharts hands formatters a loosely typed value; charts here only plot numbers. */
export const fmt = (f: (v: number) => [string, string?]) => (v: unknown) => f(Number(v)) as [string, string];

export function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

export function ChartCard({ title, sub, action, children, className }: { title: ReactNode; sub?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("gap-5 [--card-spacing:--spacing(6)]", className)}>
      <CardHeader>
        <CardTitle className="font-semibold">{title}</CardTitle>
        {sub && <CardDescription>{sub}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">{children}</CardContent>
    </Card>
  );
}

/** A labelled figure: the small stat blocks under charts and in the summary. */
export function Stat({ label, value, unit, sub, className }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm font-normal tracking-normal text-muted-foreground">{unit}</span>}
      </p>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** "↑ 12 pts vs previous 7 days", green when the change is for the better. */
export function Delta({ value, suffix, goodWhen = "up", tolerance = 0.5, className }: {
  value: number; suffix: string; goodWhen?: "up" | "down";
  /** Changes smaller than this count as no change. */
  tolerance?: number;
  className?: string;
}) {
  const flat = Math.abs(value) < tolerance;
  const Arrow = flat ? ArrowRight : value > 0 ? ArrowUpRight : ArrowDownRight;
  const good = !flat && (value > 0) === (goodWhen === "up");
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", flat ? "text-muted-foreground" : good ? "text-primary" : "text-destructive", className)}>
      <Arrow className="size-3.5" aria-hidden="true" />
      {flat ? (tolerance > 0.5 ? "On track" : "No change") : `${value > 0 ? "+" : "−"}${Math.abs(Math.round(value)).toLocaleString()}`}{flat ? "" : suffix}
    </span>
  );
}

export function VitalCard({
  label, value, unit, sub, trend, good,
}: {
  label: string; value: string; unit: string; sub: string; trend?: "up" | "down" | "stable"; good?: "up" | "down";
}) {
  const isPositive = trend === good;
  const Arrow = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : ArrowRight;
  return (
    <Card className="gap-2 [--card-spacing:--spacing(5)]">
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">
          {value}
          <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {trend && (
            <Arrow
              className={cn("size-3.5", trend !== "stable" && (isPositive ? "text-primary" : "text-destructive"))}
              aria-hidden="true"
            />
          )}
          {sub}
        </div>
      </CardContent>
    </Card>
  );
}

export function MiniSparkline({ data, color = C.primary }: { data: Point[]; color?: string }) {
  const id = `spark-${color.replace("#", "")}`;
  return (
    <ResponsiveContainer width="100%" height={64}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.18} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.75} fill={`url(#${id})`} dot={false} />
        <Tooltip contentStyle={{ ...ttStyle, fontSize: 11 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function TrendArea({ data, color, id, height = 180, domain, unit, name, width = 32 }: {
  data: Point[]; color: string; id: string; height?: number;
  domain?: [number | "auto", number | "auto"]; unit: string; name: string; width?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.18} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
        <XAxis dataKey="label" {...ax} interval="preserveStartEnd" />
        <YAxis domain={domain ?? ["auto", "auto"]} {...ax} width={width} />
        <Tooltip contentStyle={ttStyle} formatter={fmt((v) => [`${v}${unit}`, name])} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${id})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Daily (or monthly) bars, with an optional dashed target line. */
export function BarTrend({
  data, color, name, format, target, targetLabel, height = 200, width = 36, domain,
}: {
  data: Point[]; color: string; name: string; format: (v: number) => string;
  target?: number; targetLabel?: string; height?: number; width?: number; domain?: [number, number];
}) {
  return (
    <div>
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 12, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
        <XAxis dataKey="label" {...ax} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...ax} width={width} domain={domain} allowDecimals={false} />
        <Tooltip cursor={{ fill: "rgba(0,0,0,.03)" }} contentStyle={ttStyle} formatter={fmt((v) => [format(v), name])} />
        {target != null && (
          <ReferenceLine
            y={target}
            ifOverflow="extendDomain"
            stroke={C.primary}
            strokeDasharray="4 4"
          />
        )}
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
    {/* The target sits under the chart rather than on the line, where it would cover bars. */}
    {target != null && targetLabel && (
      <p className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <span className="w-4 border-t-2 border-dashed border-primary" aria-hidden="true" />
        {targetLabel}
      </p>
    )}
    </div>
  );
}

/** A line on a fixed scale, such as mood or rest scored 1–5. */
export function ScoreLine({ data, color, name, domain, ticks, format, height = 200 }: {
  data: Point[]; color: string; name: string; domain: [number, number]; ticks?: number[];
  format: (v: number) => string; height?: number;
}) {
  // Days with nothing logged come through as zero; leave them as gaps.
  const points = data.map((p) => ({ ...p, value: p.value > 0 ? p.value : null }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
        <XAxis dataKey="label" {...ax} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...ax} width={24} domain={domain} ticks={ticks} allowDecimals={false} />
        <Tooltip contentStyle={ttStyle} formatter={fmt((v) => [format(v), name])} />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color, strokeWidth: 0 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function InsightRow({ text, icon: Icon }: { text: ReactNode; icon: LucideIcon }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border px-4 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-sm">{text}</p>
    </li>
  );
}
