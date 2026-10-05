import { useEffect, useRef } from "react";
import { PartyPopper } from "lucide-react";

// The Fikko green scale.
const COLORS = ["#042509", "#094217", "#165F39", "#518F5C", "#BCD5AC", "#EEF4E8"];
const DURATION = 3000;
const PIECES = 160;

interface Piece {
  x: number; y: number; vx: number; vy: number;
  size: number; color: string; angle: number; spin: number; shape: "rect" | "circle";
}

/**
 * Confetti across the page and a "well done" message for three seconds, then
 * `onDone`. People who ask their device for reduced motion get the message
 * without the confetti.
 */
export default function Celebration({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const finish = setTimeout(onDone, DURATION);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (reduced || !canvas || !ctx) return () => clearTimeout(finish);

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const w = window.innerWidth;
    const h = window.innerHeight;
    // Two bursts from the bottom corners, thrown up and across the page.
    const pieces: Piece[] = Array.from({ length: PIECES }, (_, i) => {
      const left = i % 2 === 0;
      const speed = 9 + Math.random() * 9;
      const angle = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
      return {
        x: left ? w * 0.05 : w * 0.95,
        y: h * 0.95,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * (h / 700 + 0.4),
        size: 6 + Math.random() * 7,
        color: COLORS[i % COLORS.length],
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        shape: Math.random() < 0.7 ? "rect" : "circle",
      };
    });

    const start = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      // Fade out over the last half second.
      ctx.globalAlpha = t > DURATION - 500 ? Math.max(0, (DURATION - t) / 500) : 1;
      for (const p of pieces) {
        p.vy += 0.28; // gravity
        p.vx *= 0.99; // air
        p.vy *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        if (p.shape === "rect") ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        else { ctx.beginPath(); ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      if (t < DURATION) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      clearTimeout(finish);
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [onDone]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden="false">
      <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden="true" />
      <div className="absolute inset-x-0 top-24 flex justify-center px-4">
        <div role="status" className="celebrate-pop flex items-center gap-3 rounded-2xl bg-white px-6 py-4 shadow-xl ring-1 ring-primary/15">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
            <PartyPopper className="size-5" />
          </span>
          <div>
            <p className="text-lg font-semibold">Well done!</p>
            <p className="text-sm text-muted-foreground">You&apos;ve completed all of your habits.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
