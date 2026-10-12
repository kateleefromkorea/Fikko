import { cn } from "@/lib/utils";
import FikkoPlant from "./FikkoPlant";
import type { GardenPlant } from "../../hooks/useFikkoGarden";
import { seedById, STAGES, type Health } from "../../lib/fikko";

const W = 360;
const H = 300;
/** Where the meadow meets the hills. */
const HORIZON = 128;
const BOTTOM = H - 30;
/** The plant's size at the front of the garden; rows further back are smaller. */
const PLANT_W = 100;
const PLANT_H = 110;
/** The soil line inside FikkoPlant's 200 × 220 box. */
const SOIL_Y = 174 / 220;

type Plot =
  | { kind: "bloom"; plant: GardenPlant }
  | { kind: "current"; seedId: string; stage: number; health: Health }
  | { kind: "next" };

/**
 * The member's garden as a landscape: every plant grown to full bloom stands in
 * the meadow (newest nearest the front), the plant growing now has the front
 * plot, an empty plot waits for the next bloom, and a tree joins the hills for
 * every fully completed month.
 */
export default function GardenScene({ garden, current, trees, sunny, className }: {
  garden: GardenPlant[];
  current: { seedId: string; stage: number; health: Health } | null;
  /** Fully completed months, each a tree on the hills (a real one too, on Max). */
  trees: number;
  sunny?: boolean;
  className?: string;
}) {
  const plots: Plot[] = [
    ...(current ? [{ kind: "current", ...current } as const] : []),
    { kind: "next" },
    ...[...garden].reverse().map((plant) => ({ kind: "bloom", plant }) as const),
  ];

  // Rows from the front: three plots, then one more per row going back, until everything fits.
  const caps = [3, 4, 5];
  while (caps.reduce((a, b) => a + b, 0) < plots.length) caps.push(caps[caps.length - 1] + 1);
  const rows = caps.length;
  const slots = caps.flatMap((cap, row) => {
    const t = row / (rows - 1);
    const scale = 1 - t * 0.55;
    const y = BOTTOM - t * (BOTTOM - HORIZON - 22);
    const gap = W / cap;
    const shift = row % 2 ? gap * 0.18 : 0;
    // Fill each row from the middle outwards.
    return Array.from({ length: cap }, (_, i) => ({ row, scale, y, x: gap * (i + 0.5) + shift, i }))
      .sort((a, b) => Math.abs(a.i - (cap - 1) / 2) - Math.abs(b.i - (cap - 1) / 2) || a.i - b.i);
  });
  const placed = plots.map((plot, i) => ({ plot, ...slots[i] }))
    // Draw the back rows first so nearer plants overlap them.
    .sort((a, b) => b.row - a.row || a.x - b.x);

  const label = [
    garden.length ? `${garden.length} ${garden.length === 1 ? "plant" : "plants"} in full bloom` : "No plants harvested yet",
    current && `your ${seedById(current.seedId)?.name ?? "plant"} at the ${STAGES[current.stage].name.toLowerCase()} stage`,
    `${trees} ${trees === 1 ? "tree" : "trees"} from completed months`,
  ].filter(Boolean).join(", ");

  return (
    <div className={cn("overflow-hidden rounded-[1.5rem] border border-teal/20 shadow-sm", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Your garden: ${label}`} className="block h-auto w-full">
        <defs>
          <linearGradient id="garden-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#CFEAF8" />
            <stop offset="1" stopColor="#EEF8FC" />
          </linearGradient>
          <linearGradient id="garden-meadow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#B5E0C1" />
            <stop offset="1" stopColor="#8CCB9D" />
          </linearGradient>
        </defs>

        <rect width={W} height={H} fill="url(#garden-sky)" />
        <g fill="#FFFFFF">
          <ellipse cx="86" cy="34" rx="26" ry="8" opacity="0.9" />
          <ellipse cx="104" cy="28" rx="16" ry="8" opacity="0.9" />
          <ellipse cx="236" cy="56" rx="20" ry="6" opacity="0.7" />
        </g>
        {sunny && (
          <g transform="translate(316 38)">
            <g className="fikko-sun">
              <circle r="24" fill="#F2B630" opacity="0.18" className="fikko-sun-glow" />
              <circle r="13" fill="#F6C445" />
            </g>
          </g>
        )}

        {/* Hills, with a tree for every completed month. */}
        <path d={`M0 ${HORIZON - 14} Q70 ${HORIZON - 44} 150 ${HORIZON - 22} T300 ${HORIZON - 30} T${W} ${HORIZON - 20} V${HORIZON + 20} H0Z`} fill="#CDEBD6" />
        <path d={`M0 ${HORIZON - 4} Q110 ${HORIZON - 30} 220 ${HORIZON - 10} T${W} ${HORIZON - 12} V${HORIZON + 20} H0Z`} fill="#BFE5CA" />
        {Array.from({ length: trees }, (_, i) => {
          const per = Math.min(trees, 10);
          const line = Math.floor(i / per);
          const x = ((i % per) + 0.5 + (line % 2) * 0.5) * (W / per);
          return <Tree key={i} x={Math.min(x, W - 12)} y={HORIZON - 8 - line * 8} scale={trees > 6 ? 0.8 : 1} />;
        })}

        <path d={`M0 ${HORIZON + 2} Q90 ${HORIZON - 10} 180 ${HORIZON} T${W} ${HORIZON - 2} V${H} H0Z`} fill="url(#garden-meadow)" />
        {/* A few grass tufts and wildflowers. */}
        <g stroke="#6FB585" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.7">
          {[[22, 170], [140, 150], [250, 176], [330, 158], [60, 236], [300, 250], [180, 210]].map(([x, y]) => (
            <path key={`${x}-${y}`} d={`M${x} ${y}l-3 -7M${x} ${y}v-8M${x} ${y}l3 -7`} />
          ))}
        </g>
        {[[40, 196, "#FFFFFF"], [318, 210, "#F6C445"], [120, 262, "#FFFFFF"], [214, 160, "#F6C445"]].map(([x, y, c]) => (
          <circle key={`${x}-${y}`} cx={x as number} cy={y as number} r="2.4" fill={c as string} />
        ))}

        {placed.map(({ plot, x, y, scale }, i) => {
          const w = PLANT_W * scale;
          const h = PLANT_H * scale;
          const box = { x: x - w / 2, y: y - h * SOIL_Y, width: w, height: h };
          if (plot.kind === "next") {
            return (
              <g key="next" opacity="0.75">
                <ellipse cx={x} cy={y} rx={17 * scale} ry={4 * scale} fill="none" stroke="#7A4E26" strokeWidth="1.5" strokeDasharray="3 3" />
                <path d={`M${x} ${y - 3 * scale}v${-10 * scale}M${x - 5 * scale} ${y - 8 * scale}h${10 * scale}`} stroke="#7A4E26" strokeWidth="1.5" strokeLinecap="round" />
                <Tag x={x} y={y + 9} text="Next bloom" muted />
              </g>
            );
          }
          if (plot.kind === "current") {
            return (
              <g key="current">
                {sunny && plot.health === "growing" && <ellipse cx={x} cy={y} rx={30 * scale} ry={8 * scale} fill="#F2B630" opacity="0.25" />}
                <FikkoPlant seedId={plot.seedId} stage={plot.stage} health={plot.health} inGround box={box} />
                <Tag x={x} y={y + 9} text={`Your ${seedById(plot.seedId)?.name ?? "plant"}`} />
              </g>
            );
          }
          return <FikkoPlant key={plot.plant.id ?? i} seedId={plot.plant.seed} stage={4} inGround box={box} />;
        })}
      </svg>
    </div>
  );
}

/** A small name tag under a plot. */
function Tag({ x, y, text, muted }: { x: number; y: number; text: string; muted?: boolean }) {
  const w = text.length * 5.6 + 14;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y="0" width={w} height="15" rx="7.5" fill="#FFFFFF" opacity={muted ? 0.6 : 0.92} />
      <text y="10.8" textAnchor="middle" fontSize="9.5" fontWeight="600" fill={muted ? "#5B5040" : "#0B5C3E"} fontFamily="inherit">{text}</text>
    </g>
  );
}

/** A tree for a completed month. */
function Tree({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-2.5" y="-14" width="5" height="16" rx="1.5" fill="#8A5A2B" />
      <circle cx="0" cy="-26" r="13" fill="#2F8F68" />
      <circle cx="-8" cy="-18" r="9" fill="#2F8F68" />
      <circle cx="8" cy="-19" r="9" fill="#3FA67A" />
      <circle cx="3" cy="-31" r="7" fill="#4DB487" />
    </g>
  );
}
