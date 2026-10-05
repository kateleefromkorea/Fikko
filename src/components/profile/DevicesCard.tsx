import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  PROVIDER_INFO, connectDevice, disconnectDevice, fetchConnections, syncDevice, type Connection, type Provider,
} from "../../lib/devices";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// Devices that connect for real, in display order. Oura's connection is built
// but switched off; add "oura" here to let members connect it.
const LIVE: Provider[] = ["google"];

// Integrations members can't connect yet, in priority order. "Up next" are
// the two being built first; the rest are planned.
const PLANNED: { id: string; name: string; description: string; next?: boolean }[] = [
  { id: "apple-health", name: "Apple Health", description: "Steps, workouts, sleep & heart rate from iPhone and Apple Watch", next: true },
  { id: "garmin", name: "Garmin Connect", description: "Workouts, sleep, heart rate, VO2 max & body battery", next: true },
  { id: "oura", name: "Oura Ring", description: "Sleep, readiness, HRV & SpO₂" },
  { id: "whoop", name: "WHOOP", description: "Recovery score, strain & sleep performance" },
  { id: "samsung", name: "Samsung Health", description: "Steps, workouts & sleep from Galaxy Watch" },
];

export interface DeviceOutcome { provider: Provider | null; result: "connected" | "declined" | "failed" }

function outcomeText({ provider, result }: DeviceOutcome) {
  const name = provider ? PROVIDER_INFO[provider].name : "your device";
  if (result === "connected") return `${name} is connected. Your last 30 days are synced, and new data syncs every night.`;
  if (result === "declined") return `${name} wasn't connected because access wasn't approved.`;
  return `We couldn't connect ${name}. Please try again.`;
}

/** "just now", "5 min ago", "3 hours ago", "2 days ago", then a date. */
function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return `on ${new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

/**
 * Wearable connections. Fitbit & Pixel Watch (via Google) connect for real;
 * the rest are listed as planned. After a sync or disconnect,
 * `onSynced` lets the app reload the readings.
 */
export default function DevicesCard({ outcome, onSynced }: { outcome: DeviceOutcome | null; onSynced: () => void }) {
  const [conns, setConns] = useState<Connection[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(outcome ? outcomeText(outcome) : null);
  const [error, setError] = useState<string | null>(outcome?.result === "failed" ? outcomeText(outcome) : null);
  const [confirming, setConfirming] = useState<Provider | null>(null);
  const [deleteData, setDeleteData] = useState(false);

  const refresh = useCallback(async () => setConns(await fetchConnections()), []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function run(key: string, fn: () => Promise<unknown>, done?: string, reload = true) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await fn();
      if (done) setMessage(done);
      await refresh();
      if (reload) onSynced();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="gap-6 [--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Connected devices</CardTitle>
        <CardDescription>Connect Fitbit or Pixel Watch now. Apple Health and Garmin are coming next.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(message || error) && (
          <p role="status" className={error ? "text-sm text-destructive" : "rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm"}>
            {error ?? message}
          </p>
        )}

        {LIVE.map((p) => {
          const info = PROVIDER_INFO[p];
          const c = conns.find((x) => x.provider === p);
          return (
            <div key={p} className="flex flex-wrap items-center gap-4 rounded-lg border px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {info.name}
                  {c && (
                    <Badge variant="outline" className={c.status === "active" ? "border-primary/30 bg-primary/5 text-primary-ink" : "border-destructive/30 text-destructive"}>
                      {c.status === "active" ? "Connected" : "Needs attention"}
                    </Badge>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {!c
                    ? info.description
                    : c.status === "error"
                      ? c.lastError ?? "The last sync didn't finish."
                      : c.lastSyncedAt
                        ? `Last synced ${ago(c.lastSyncedAt)}`
                        : "Connected, first sync pending"}
                </p>
              </div>
              {!c || c.status === "error" ? (
                <div className="flex gap-2">
                  <Button onClick={() => run(`connect-${p}`, () => connectDevice(p), undefined, false)} disabled={busy !== null} className="h-9">
                    {busy === `connect-${p}` && <Loader2 className="animate-spin" />}
                    {c ? "Reconnect" : "Connect"}
                  </Button>
                  {c && (
                    <Button variant="ghost" onClick={() => setConfirming(p)} disabled={busy !== null} className="h-9 text-muted-foreground">
                      Disconnect
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => run(`sync-${p}`, async () => {
                      const n = await syncDevice(p);
                      setMessage(n ? `Synced ${n} readings from ${info.name}.` : "You're up to date.");
                    })}
                    disabled={busy !== null}
                    className="h-9"
                  >
                    {busy === `sync-${p}` ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    Sync now
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(p)} disabled={busy !== null} className="h-9 text-muted-foreground">
                    Disconnect
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        <ul className="grid gap-3 sm:grid-cols-2">
          {PLANNED.map((c) => (
            <li key={c.id} className="flex items-center gap-4 rounded-lg border px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="truncate text-sm text-muted-foreground">{c.description}</p>
              </div>
              {c.next ? (
                <Badge variant="outline" className="shrink-0 border-primary/30 bg-primary/5 text-primary-ink">Up next</Badge>
              ) : (
                <Badge variant="secondary" className="shrink-0">Soon</Badge>
              )}
            </li>
          ))}
        </ul>
      </CardContent>

      <Dialog open={!!confirming} onOpenChange={(o) => { if (!o) { setConfirming(null); setDeleteData(false); } }}>
        <DialogContent>
          {confirming && (
            <>
              <DialogHeader>
                <DialogTitle>Disconnect {PROVIDER_INFO[confirming].name}?</DialogTitle>
                <DialogDescription>Fikko will stop syncing and lose access to that account. You can reconnect any time.</DialogDescription>
              </DialogHeader>
              <Label className="flex cursor-pointer items-start gap-3 text-sm font-normal">
                <Checkbox checked={deleteData} onCheckedChange={(v) => setDeleteData(v === true)} className="mt-0.5" />
                Also delete the data already synced from it
              </Label>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                <Button
                  variant="destructive"
                  disabled={busy !== null}
                  onClick={async () => {
                    const p = confirming;
                    const del = deleteData;
                    setConfirming(null);
                    setDeleteData(false);
                    await run(`disconnect-${p}`, () => disconnectDevice(p, del),
                      del ? `${PROVIDER_INFO[p].name} disconnected and its data deleted.` : `${PROVIDER_INFO[p].name} disconnected. Your synced data stays.`);
                  }}
                >
                  Disconnect
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
