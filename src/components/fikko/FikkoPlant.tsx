import { cn } from "@/lib/utils";
import { potById, seedById, STAGES, type Health } from "../../lib/fikko";

interface Props {
  seedId: string;
  /** Index into STAGES. */
  stage: number;
  health?: Health;
  potId?: string;
  companionId?: string;
  /** Sways gently while growing. Off for small previews. */
  animate?: boolean;
  className?: string;
}

const WILT = { leaf: "#A88B4A", leafLight: "#BFA060", flower: "#C9A27A", stem: "#8C7A45" };
const DEAD = { leaf: "#8A8F8E", leafLight: "#9DA2A1", flower: "#8A8F8E", stem: "#7A7F7E" };

/** A member's plant, drawn from its seed, stage and health. */
export default function FikkoPlant({ seedId, stage, health = "growing", potId = "clay", companionId = "none", animate, className }: Props) {
  const seed = seedById(seedId) ?? seedById("sprout")!;
  const pot = potById(potId);
  const colours =
    health === "dead" ? DEAD
    : health === "withering" ? WILT
    : { leaf: seed.leaf, leafLight: seed.leafLight, flower: seed.flower, stem: "#157954" };
  // How far the plant leans and its leaves hang.
  const droop = health === "dead" ? 2 : health === "withering" ? 1 : 0;

  const top = 170 - [8, 40, 75, 105, 125][stage];
  const tipX = 100 + droop * 14;
  const tipY = top + droop * 10;
  const pairs = Math.min(stage + 1, 4);

  const leaves = Array.from({ length: stage === 0 ? 0 : pairs }, (_, i) => {
    const y = 168 - (i + 1) * ((168 - top) / (pairs + 0.6));
    const s = 10 + stage * 3 - i * 1.5;
    // Follow the stem's lean, and hang lower the sicker the plant is.
    const t = (172 - y) / (172 - top);
    const x = 100 + droop * 14 * t * t;
    const hang = droop * 28;
    return (
      <g key={i}>
        <path d={`M${x} ${y} q${-s * 1.4} ${-s * 0.4} ${-s * 2} ${s * 0.3} q${s * 1.2} ${s * 0.5} ${s * 2} ${-s * 0.3}Z`} fill={colours.leaf} transform={`rotate(${-hang} ${x} ${y})`} />
        <path d={`M${x} ${y - 4} q${s * 1.4} ${-s * 0.4} ${s * 2} ${s * 0.3} q${-s * 1.2} ${s * 0.5} ${-s * 2} ${-s * 0.3}Z`} fill={colours.leafLight} transform={`rotate(${hang} ${x} ${y - 4})`} />
      </g>
    );
  });

  let crown = null;
  if (stage === 1) {
    crown = (
      <>
        <path d={`M${tipX} ${tipY} c-10 -2 -14 -10 -14 -16 c8 0 14 6 14 16Z`} fill={colours.leaf} />
        <path d={`M${tipX} ${tipY} c10 -2 14 -10 14 -16 c-8 0 -14 6 -14 16Z`} fill={colours.leafLight} />
      </>
    );
  } else if (stage === 3) {
    crown = <ellipse cx={tipX} cy={tipY - 6} rx="7" ry="10" fill={colours.flower} opacity="0.85" />;
  } else if (stage === 4) {
    if (seed.shape === "leaf") {
      // The Fikko logo's two leaves, grown large, cradling a dewdrop bud.
      crown = (
        <g transform={`translate(${tipX - 11 * 3.2} ${tipY + 16 - 21 * 3.2}) scale(3.2)`}>
          {health === "growing" && <circle cx="11" cy="8.6" r="6" fill="#5BA9F0" opacity="0.18" />}
          <path d="M11 21C5.8 21.1 2.6 17.9 2.4 12.7 7.6 12.5 10.9 15.8 11 21Z" fill={colours.leaf} />
          <path d="M11 18.5C11.1 12.9 14.3 9.4 19.8 9.1 20 14.7 16.6 18.3 11 18.5Z" fill={colours.leafLight} />
          <path d="M11 4.6C12.9 7 14 8.6 14 10.2a3 3 0 0 1-6 0C8 8.6 9.1 7 11 4.6Z" fill={health === "growing" ? "#5BA9F0" : colours.flower} />
          <ellipse cx="10" cy="9.6" rx="0.7" ry="1.1" fill="#FFFFFF" opacity="0.75" />
        </g>
      );
    } else if (seed.shape === "tulip") {
      crown = <path d={`M${tipX - 16} ${tipY - 4} q0 -26 8 -30 l8 12 l8 -12 q8 4 8 30 q-16 14 -32 0Z`} fill={colours.flower} />;
    } else if (seed.shape === "spike") {
      crown = (
        <>
          {Array.from({ length: 6 }, (_, i) => (
            <ellipse key={i} cx={tipX + (i % 2 ? 4 : -4)} cy={tipY - 6 - i * 7} rx="5" ry="6" fill={colours.flower} />
          ))}
        </>
      );
    } else {
      crown = (
        <>
          {Array.from({ length: 8 }, (_, i) => (
            <ellipse key={i} cx={tipX} cy={tipY - 14} rx="6" ry="14" fill={colours.flower} transform={`rotate(${i * 45} ${tipX} ${tipY})`} />
          ))}
          <circle cx={tipX} cy={tipY} r="8" fill={health === "growing" ? "#8A5A2B" : colours.stem} />
        </>
      );
    }
  }

  const alive = health !== "dead";

  return (
    <svg viewBox="0 0 200 220" role="img" aria-label={`${seed.name}, ${STAGES[stage].name.toLowerCase()} stage`} className={cn("block h-auto w-full", className)}>
      <ellipse cx="100" cy="212" rx="56" ry="5" fill="#001F27" opacity="0.08" />
      <g className={cn(animate && health === "growing" && "fikko-sway")}>
        {stage === 0 ? (
          <ellipse cx="100" cy="166" rx="9" ry="6" fill={alive ? "#9A6B3F" : DEAD.stem} />
        ) : (
          <path
            d={`M100 172 Q${100 + droop * 6} ${(172 + top) / 2} ${tipX} ${tipY}`}
            stroke={colours.stem}
            strokeWidth={3 + stage}
            fill="none"
            strokeLinecap="round"
          />
        )}
        {leaves}
        {crown}
      </g>
      <path d="M62 172 h76 l-8 38 h-60Z" fill={pot.body} />
      <rect x="58" y="166" width="84" height="12" rx="4" fill={pot.rim} />
      {alive && companionId === "ladybug" && (
        <g transform="translate(128 150)">
          <circle r="7" fill="#E04B4B" />
          <path d="M0 -7V7" stroke="#222" strokeWidth="1.2" />
          <circle cx="-3" cy="-2" r="1.5" fill="#222" />
          <circle cx="3" cy="2" r="1.5" fill="#222" />
          <circle cx="0" cy="-8" r="3" fill="#222" />
        </g>
      )}
      {alive && companionId === "butterfly" && (
        <g transform="translate(150 70)">
          <g className={cn(animate && "fikko-flutter")}>
          <ellipse cx="-7" cy="-4" rx="8" ry="10" fill="#1F73C2" transform="rotate(-20)" />
          <ellipse cx="7" cy="-4" rx="8" ry="10" fill="#5BA9F0" transform="rotate(20)" />
          <rect x="-1.5" y="-10" width="3" height="18" rx="1.5" fill="#001F27" />
          </g>
        </g>
      )}
    </svg>
  );
}
