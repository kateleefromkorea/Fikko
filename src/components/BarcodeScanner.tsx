import { useEffect, useRef, useState, type FormEvent } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// The barcodes printed on food packaging.
const FORMATS = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E];

/**
 * Live camera barcode scanning, with typing the number as a fallback for
 * when the camera is blocked or unavailable. Calls `onCode` once with the digits.
 */
export default function BarcodeScanner({ onCode, onCancel }: { onCode: (code: string) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const done = useRef(false);

  useEffect(() => {
    let controls: IScannerControls | null = null;
    let cancelled = false;
    const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, FORMATS]]);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser can't use the camera here. Type the number under the barcode instead.");
      return;
    }
    reader
      .decodeFromConstraints({ video: { facingMode: "environment" }, audio: false }, videoRef.current!, (result, _err, c) => {
        if (!result || done.current) return;
        done.current = true;
        c.stop();
        navigator.vibrate?.(60);
        onCode(result.getText());
      })
      .then((c) => {
        controls = c;
        if (cancelled) c.stop();
      })
      .catch((err: unknown) => {
        const name = err instanceof DOMException ? err.name : "";
        setCameraError(
          name === "NotAllowedError"
            ? "Camera access was blocked. Allow it in your browser settings, or type the number under the barcode."
            : "We couldn't start the camera. Type the number under the barcode instead.",
        );
      });
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onCode]);

  function submitTyped(e: FormEvent) {
    e.preventDefault();
    const code = typed.replace(/\D/g, "");
    if (code.length >= 8 && code.length <= 14) onCode(code);
  }

  return (
    <div className="space-y-3">
      {!cameraError && (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full object-cover" aria-label="Camera preview for barcode scanning" />
          {/* Aiming guide */}
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" aria-hidden="true" />
          <p className="absolute inset-x-0 bottom-2 text-center text-xs text-white/90">Point at the barcode on the pack</p>
        </div>
      )}
      {cameraError && <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">{cameraError}</p>}

      <form onSubmit={submitTyped} className="flex gap-2">
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          inputMode="numeric"
          placeholder="Or type the barcode number"
          aria-label="Barcode number"
          className="h-9"
        />
        <Button type="submit" variant="outline" disabled={typed.replace(/\D/g, "").length < 8} className="h-9 px-4">Look up</Button>
      </form>
      <Button variant="ghost" onClick={onCancel} className="h-8 px-3 text-muted-foreground">Cancel scanning</Button>
    </div>
  );
}
