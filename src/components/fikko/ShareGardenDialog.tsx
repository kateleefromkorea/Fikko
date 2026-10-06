import { useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import FikkoPlant from "./FikkoPlant";
import type { GardenPlant } from "../../hooks/useFikkoGarden";

// The card is drawn at Instagram/TikTok Stories size and saved as a PNG.
const W = 1080;
const H = 1920;
const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  garden: GardenPlant[];
}

/**
 * A Stories-sized image of the member's garden to post. Shows plants, complete
 * days and trees only: never weight, meals or other health details.
 */
export default function ShareGardenDialog({ open, onOpenChange, garden }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = garden.slice(-9);
  const cols = shown.length <= 1 ? 1 : shown.length <= 4 ? 2 : 3;
  const cell = cols === 1 ? 560 : cols === 2 ? 400 : 290;
  const rows = Math.ceil(shown.length / cols);
  const gridTop = 560;
  const gridLeft = (W - cols * cell) / 2;
  const days = garden.reduce((sum, p) => sum + p.completeDays, 0);

  async function save() {
    const svg = svgRef.current;
    if (!svg || saving) return;
    setSaving(true);
    setError(null);
    try {
      const xml = new XMLSerializer().serializeToString(svg);
      const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("load"));
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      canvas.getContext("2d")!.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(url);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("blob");
      const file = new File([blob], "my-fikko-garden.png", { type: "image/png" });
      // Phones can hand the image straight to Instagram; elsewhere it downloads.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] }).catch(() => {});
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
    } catch {
      setError("We couldn't create the image. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Share your garden</DialogTitle>
          <DialogDescription>
            An image sized for Instagram and TikTok Stories. It shows your plants, complete days and trees, never your
            health details.
          </DialogDescription>
        </DialogHeader>

        <div className="mx-auto w-full max-w-64 overflow-hidden rounded-2xl shadow-lg">
          <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-auto w-full" role="img" aria-label="Your garden card">
            <defs>
              <linearGradient id="share-bg" x1="0" y1="0" x2="0.4" y2="1">
                <stop offset="0" stopColor="#157954" />
                <stop offset="0.55" stopColor="#0A6E63" />
                <stop offset="1" stopColor="#003A35" />
              </linearGradient>
              <radialGradient id="share-glow" cx="0.85" cy="0.08" r="0.55">
                <stop offset="0" stopColor="#5BA9F0" stopOpacity="0.55" />
                <stop offset="1" stopColor="#5BA9F0" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width={W} height={H} fill="url(#share-bg)" />
            <rect width={W} height={H} fill="url(#share-glow)" />
            <text x="90" y="170" fill="#FFFFFF" fontFamily={FONT} fontSize="44" fontWeight="700" letterSpacing="5">FIKKO</text>
            <text x="90" y="320" fill="#FFFFFF" fontFamily={FONT} fontSize="96" fontWeight="600">My garden</text>
            <text x="90" y="430" fill="#FFFFFF" fontFamily={FONT} fontSize="96" fontWeight="600">is growing</text>

            <rect x={gridLeft - 30} y={gridTop - 30} width={cols * cell + 60} height={rows * cell * 1.1 + 60} rx="48" fill="#FFFFFF" fillOpacity="0.12" />
            {shown.map((p, i) => (
              <FikkoPlant
                key={p.id}
                seedId={p.seed}
                stage={4}
                potId={p.pot}
                companionId={p.companion}
                box={{ x: gridLeft + (i % cols) * cell, y: gridTop + Math.floor(i / cols) * cell * 1.1, width: cell, height: cell * 1.1 }}
              />
            ))}

            {[
              { value: garden.length, label: garden.length === 1 ? "plant grown" : "plants grown" },
              { value: days, label: "complete days" },
              { value: garden.length, label: garden.length === 1 ? "real tree" : "real trees" },
            ].map((s, i) => (
              <g key={s.label} transform={`translate(${90 + i * 320} 1640)`}>
                <text fill="#FFFFFF" fontFamily={FONT} fontSize="88" fontWeight="600">{s.value}</text>
                <text y="62" fill="#FFFFFF" fillOpacity="0.8" fontFamily={FONT} fontSize="36">{s.label}</text>
              </g>
            ))}
            <text x="90" y="1840" fill="#FFFFFF" fillOpacity="0.75" fontFamily={FONT} fontSize="34">Grow yours at fikko.io</text>
          </svg>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button onClick={save} disabled={saving} className="h-10 w-full bg-button hover:bg-button-hover">
          {saving ? <Loader2 className="animate-spin" /> : <Download />}
          Save image
        </Button>
      </DialogContent>
    </Dialog>
  );
}
