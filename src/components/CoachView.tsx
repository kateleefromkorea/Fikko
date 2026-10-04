import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ArrowUp, Loader2, Trash2 } from "lucide-react";
import FikkoAvatar from "./FikkoAvatar";
import PageHeader from "./PageHeader";
import {
  COACH_DAILY_LIMIT, clearCoachChat, fetchCoachMessages, fetchUsedToday, sendCoachMessage, type CoachMessage,
} from "../lib/coach";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const STARTERS = [
  "How did my week go?",
  "Why might my sleep be inconsistent?",
  "Give me a simple plan to drink more water",
  "What could I have for dinner tonight?",
];

/** Inline **bold**, the one bit of markdown the coach still sometimes uses. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => (/^\*\*[^*]+\*\*$/.test(p) ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong> : p))}</>;
}

/** A reply as the member sees it: paragraphs and "- " bullets, nothing fancier. */
function Formatted({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}><Inline text={l.replace(/^\s*[-•]\s+/, "")} /></li>)}
            </ul>
          );
        }
        return <p key={i} className="whitespace-pre-wrap"><Inline text={block} /></p>;
      })}
    </div>
  );
}

/** A message from Fikko: the sprout avatar, then the bubble. `named` adds "Fikko · AI" above the first of a run. */
function FikkoMessage({ named, children }: { named: boolean; children: ReactNode }) {
  return (
    <div className="flex items-end gap-2.5">
      <FikkoAvatar className={cn(!named && "invisible")} />
      <div className="max-w-[85%] min-w-0">
        {named && (
          <p className="mb-1 ml-1 text-xs font-medium text-muted-foreground">
            Fikko <span className="font-normal">· AI coach</span>
          </p>
        )}
        <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-sm leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

/** The AI coach, Fikko: a chat grounded in what the member has logged in Fikko. */
export default function CoachView({ profileName }: { profileName: string }) {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [used, setUsed] = useState(0);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    Promise.all([fetchCoachMessages(), fetchUsedToday()])
      .then(([m, u]) => { if (live) { setMessages(m); setUsed(u); } })
      .catch((e: Error) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, streaming]);

  const left = Math.max(0, COACH_DAILY_LIMIT - used);
  const busy = streaming !== null;

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy || left === 0) return;
    setError(null);
    setDraft("");
    const now = new Date().toISOString();
    setMessages((m) => [...m, { id: `local-${now}`, role: "user", content: message, createdAt: now }]);
    setStreaming("");
    try {
      const reply = await sendCoachMessage(message, setStreaming);
      setMessages((m) => [...m, { id: `local-${now}-reply`, role: "assistant", content: reply, createdAt: new Date().toISOString() }]);
      setUsed((u) => u + 1);
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== `local-${now}`));
      setDraft(message);
      setError(err instanceof Error ? err.message : "Fikko couldn't reply. Please try again.");
    } finally {
      setStreaming(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(draft);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
  }

  async function clear() {
    setConfirmClear(false);
    try {
      await clearCoachChat();
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't clear your chat.");
    }
  }

  const empty = !loading && messages.length === 0 && !busy;
  const firstName = profileName.split(" ")[0];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="AI Coach"
        title="Ask Fikko about your week."
        subtitle={loading
          ? "Fikko reads your last four weeks of logs."
          : `Fikko reads your last four weeks of logs. ${left === 0 ? "No questions left today; back at midnight." : `${left} ${left === 1 ? "question" : "questions"} left today.`}`}
        action={messages.length > 0 && (
          <Button variant="ghost" onClick={() => setConfirmClear(true)} disabled={busy} className="h-9 text-muted-foreground">
            <Trash2 />
            Clear chat
          </Button>
        )}
      />

      <Card className="mx-auto flex w-full max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <div className="min-h-[50vh] flex-1 space-y-5 px-5 py-6 sm:px-8">
          {loading && (
            <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading your chat…
            </p>
          )}

          {empty && (
            <div className="flex flex-col items-center py-10 text-center">
              <FikkoAvatar className="size-14" />
              <h2 className="mt-4 text-xl font-semibold">Hi{firstName ? ` ${firstName}` : ""}, I'm Fikko.</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                I'm your AI habit coach. Ask about your meals, water, sleep, activity or mood. I look at your last four weeks of logs, so the more you log, the more useful I get.
              </p>
              <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
                {STARTERS.map((s) => (
                  <Button key={s} variant="outline" onClick={() => void send(s)} disabled={left === 0} className="h-auto rounded-full px-4 py-2 text-sm font-normal whitespace-normal">
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground">
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ) : (
            <FikkoMessage key={m.id} named={messages[i - 1]?.role !== "assistant"}>
              <Formatted text={m.content} />
            </FikkoMessage>
          ))}

          {busy && (
            <div aria-live="polite">
              <FikkoMessage named>
                {streaming ? <Formatted text={streaming} /> : (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Fikko is looking at your data…
                  </span>
                )}
              </FikkoMessage>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={onSubmit} className="border-t bg-muted/30 px-5 py-4 sm:px-8">
          {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={left === 0 ? "You've used today's messages. Back at midnight." : "Ask Fikko…"}
              aria-label="Message Fikko"
              maxLength={2000}
              rows={1}
              disabled={left === 0}
              className="max-h-40 min-h-11 resize-none bg-background"
            />
            <Button type="submit" size="icon" disabled={!draft.trim() || busy || left === 0} className="size-11 shrink-0" aria-label="Send">
              {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
            </Button>
          </div>
          <p className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Fikko is an AI. It can make mistakes and isn't medical advice.</span>
            {!loading && <span className="tabular-nums">{left} of {COACH_DAILY_LIMIT} AI messages left today</span>}
          </p>
        </form>
      </Card>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear your chat with Fikko?</DialogTitle>
            <DialogDescription>
              This permanently deletes your conversation. It doesn't change your daily message count or anything you've logged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button variant="destructive" onClick={() => void clear()}>Clear chat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
