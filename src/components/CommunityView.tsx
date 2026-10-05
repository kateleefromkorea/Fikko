import { useEffect, useState } from "react";
import {
  Flag, Heart, Loader2, MessageCircle, MoreHorizontal, RefreshCw, Send, ShieldCheck, Trash2, Users,
} from "lucide-react";
import PageHeader from "./PageHeader";
import { EmptyState } from "./HabitCard";
import { useCommunityFeed } from "../hooks/useCommunityFeed";
import {
  COMMENT_MAX, POST_MAX, TOPICS, addComment, deleteComment, fetchComments, initialsOf, timeAgo, topicInfo,
  type Comment, type Post, type Topic,
} from "../lib/community";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  userId: string;
  profileName: string;
}

/** Mirrors the database's display-name rule, for the "Posting as" preview only. */
function displayName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Fikko member";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

function TopicBadge({ topic }: { topic: Topic }) {
  const { label, icon: Icon } = topicInfo(topic);
  return (
    <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </Badge>
  );
}

/** A small pressable pill: used for topic pickers and feed filters. */
function Pill({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "border-primary bg-primary/8 text-primary-ink" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CharCount({ length, max }: { length: number; max: number }) {
  const left = max - length;
  if (left > max * 0.2) return null;
  return <span className={cn("text-xs tabular-nums", left < 0 ? "text-destructive" : "text-muted-foreground")}>{left}</span>;
}

// ── Composer ───────────────────────────────────────────────────────────────

function Composer({ profileName, onPost }: { profileName: string; onPost: (topic: Topic, body: string) => Promise<unknown> }) {
  const [topic, setTopic] = useState<Topic>("win");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = body.trim();
  const valid = trimmed.length > 0 && trimmed.length <= POST_MAX;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || posting) return;
    setPosting(true);
    setError(null);
    try {
      await onPost(topic, trimmed);
      setBody("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPosting(false);
    }
  }

  return (
    <Card className="gap-4">
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <label htmlFor="community-composer" className="sr-only">Share with the community</label>
          <Textarea
            id="community-composer"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              topic === "question" ? "Ask the community something…"
              : topic === "tip" ? "Share something that works for you…"
              : topic === "motivation" ? "Say something encouraging…"
              : "Share a win, big or small…"
            }
            className="min-h-24 resize-none"
            maxLength={POST_MAX + 50}
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Topic">
              {TOPICS.map((t) => (
                <Pill key={t.key} selected={topic === t.key} onClick={() => setTopic(t.key)}>
                  <t.icon className="size-3.5" aria-hidden="true" />
                  {t.label}
                </Pill>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-3">
              <CharCount length={trimmed.length} max={POST_MAX} />
              <Button type="submit" disabled={!valid || posting}>
                {posting ? <Loader2 className="animate-spin" /> : <Send />}
                Post
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Posting as <span className="font-medium text-foreground">{displayName(profileName)}</span>
            <span aria-hidden="true"> · </span>visible to everyone signed in to Fikko
          </p>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}

// ── Comments ───────────────────────────────────────────────────────────────

function Comments({ postId, userId, onCountChange }: { postId: string; userId: string; onCountChange: (delta: number) => void }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchComments(postId)
      .then((c) => !cancelled && setComments(c))
      .catch((err) => !cancelled && setError((err as Error).message));
    return () => { cancelled = true; };
  }, [postId]);

  const trimmed = body.trim();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || trimmed.length > COMMENT_MAX || sending) return;
    setSending(true);
    setError(null);
    try {
      const c = await addComment(postId, trimmed);
      setComments((prev) => [...(prev ?? []), c]);
      onCountChange(1);
      setBody("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteComment(id);
      setComments((prev) => prev?.filter((c) => c.id !== id) ?? null);
      onCountChange(-1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-4 border-t pt-4">
      {comments === null && !error && <p className="text-sm text-muted-foreground">Loading comments…</p>}
      {comments?.length === 0 && <p className="text-sm text-muted-foreground">No comments yet. Say something kind.</p>}
      {comments && comments.length > 0 && (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Avatar size="sm">
                <AvatarFallback className="bg-muted text-xs">{initialsOf(c.authorName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 rounded-lg bg-muted/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.authorName}</span>
                  <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
                  {c.userId === userId && (
                    <Button
                      variant="ghost" size="icon-xs" className="ml-auto text-muted-foreground"
                      onClick={() => remove(c.id)} aria-label="Delete your comment"
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={send} className="flex items-end gap-2">
        <label htmlFor={`reply-${postId}`} className="sr-only">Write a comment</label>
        <Textarea
          id={`reply-${postId}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment…"
          className="min-h-9 resize-none"
          maxLength={COMMENT_MAX + 50}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <Button type="submit" size="icon" disabled={!trimmed || trimmed.length > COMMENT_MAX || sending} aria-label="Send comment">
          {sending ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}

// ── A post ─────────────────────────────────────────────────────────────────

function PostCard({
  post, userId, onCheer, onDelete, onReport, onCommentCount,
}: {
  post: Post;
  userId: string;
  onCheer: () => void;
  onDelete: () => void;
  onReport: () => void;
  onCommentCount: (delta: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const mine = post.userId === userId;

  return (
    <Card className="gap-4">
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback className={cn("text-sm font-medium", mine ? "bg-primary/10 text-primary-ink" : "bg-muted")}>
              {initialsOf(post.authorName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {post.authorName}
              {mine && <span className="ml-1.5 font-normal text-muted-foreground">(you)</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              <time dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString()}>{timeAgo(post.createdAt)}</time>
            </p>
          </div>
          <TopicBadge topic={post.topic} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Post options">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {mine ? (
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  <Trash2 />
                  Delete post
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={onReport}>
                  <Flag />
                  Report post
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{post.body}</p>

        <div className="flex items-center gap-1 -ml-2">
          <Button
            variant="ghost" size="sm" onClick={onCheer} aria-pressed={post.cheeredByMe}
            className={cn("text-muted-foreground", post.cheeredByMe && "text-primary-ink hover:text-primary-ink")}
          >
            <Heart className={cn(post.cheeredByMe && "fill-current")} />
            {post.cheers > 0 ? post.cheers : ""} Cheer{post.cheers === 1 || post.cheers === 0 ? "" : "s"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-muted-foreground">
            <MessageCircle />
            {post.comments > 0 ? `${post.comments} ` : ""}{post.comments === 1 ? "Comment" : "Comments"}
          </Button>
        </div>

        {open && <Comments postId={post.id} userId={userId} onCountChange={onCommentCount} />}
      </CardContent>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

const GUIDELINES = [
  "Be kind. Everyone here is working on something.",
  "Share experience, not medical advice. For health decisions, talk to a professional.",
  "Keep it about wellbeing. No selling, spam or links to shady products.",
  "Protect privacy: yours and other people's.",
];

/** A live line about today's feed. Only counted on the unfiltered feed, which is the whole picture. */
function feedHeadline(posts: Post[], loading: boolean, filter: Topic | undefined) {
  if (loading || filter) return "What everyone's working on.";
  const today = new Date().toDateString();
  const people = new Set(posts.filter((p) => new Date(p.createdAt).toDateString() === today).map((p) => p.userId)).size;
  if (people === 0) return "Nobody's posted yet today. Go first?";
  return people === 1 ? "1 person has posted today." : `${people} people have posted today.`;
}

export default function CommunityView({ userId, profileName }: Props) {
  const [filter, setFilter] = useState<Topic | undefined>(undefined);
  const feed = useCommunityFeed(userId, filter);
  const [confirmDelete, setConfirmDelete] = useState<Post | null>(null);
  const [reporting, setReporting] = useState<Post | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function doDelete() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await feed.remove(confirmDelete.id);
      setConfirmDelete(null);
    } catch (err) {
      feed.setError((err as Error).message);
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  }

  async function doReport() {
    if (!reporting) return;
    setBusy(true);
    try {
      await feed.report(reporting.id, reportReason);
      setNotice("Thanks for reporting. We've hidden that post from your feed and will review it.");
    } catch (err) {
      feed.setError((err as Error).message);
    } finally {
      setBusy(false);
      setReporting(null);
      setReportReason("");
    }
  }

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Community"
        title={feedHeadline(feed.posts, feed.loading, filter)}
        action={
          <Button variant="outline" onClick={() => feed.reload()} disabled={feed.loading}>
            <RefreshCw className={cn(feed.loading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Composer profileName={profileName} onPost={feed.create} />

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter posts by topic">
            <Pill selected={!filter} onClick={() => setFilter(undefined)}>All</Pill>
            {TOPICS.map((t) => (
              <Pill key={t.key} selected={filter === t.key} onClick={() => setFilter(t.key)}>
                <t.icon className="size-3.5" aria-hidden="true" />
                {t.plural}
              </Pill>
            ))}
          </div>

          {notice && (
            <p className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm text-primary-ink" role="status">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{notice}</span>
              <button className="text-xs underline" onClick={() => setNotice(null)}>Dismiss</button>
            </p>
          )}
          {feed.error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
              {feed.error}
            </p>
          )}

          {feed.loading && feed.posts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading the community…</p>
          ) : feed.posts.length === 0 ? (
            <EmptyState
              icon={Users}
              title={filter ? `No ${topicInfo(filter).plural.toLowerCase()} yet` : "Nothing here yet"}
              body={filter ? "Be the first to post one." : "Be the first to share a win or ask a question."}
              className="bg-card"
            />
          ) : (
            <div className="space-y-4">
              {feed.posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  userId={userId}
                  onCheer={() => feed.toggleCheer(post)}
                  onDelete={() => setConfirmDelete(post)}
                  onReport={() => setReporting(post)}
                  onCommentCount={(d) => feed.setCommentCount(post.id, d)}
                />
              ))}
              {feed.hasMore && (
                <div className="flex justify-center pt-2">
                  <Button variant="outline" onClick={() => feed.loadMore()} disabled={feed.loadingMore}>
                    {feed.loadingMore && <Loader2 className="animate-spin" />}
                    Load more
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <Card className="lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-4 text-primary-ink" aria-hidden="true" />
              Community guidelines
            </CardTitle>
            <CardDescription>Keep Fikko a supportive place.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-sm">
              {GUIDELINES.map((g) => (
                <li key={g} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden="true" />
                  <span className="text-muted-foreground">{g}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              See something that breaks these? Use <span className="font-medium text-foreground">Report</span> on the post.
              Posts reported by several members are hidden automatically.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this post?</DialogTitle>
            <DialogDescription>It will be removed for everyone, along with its comments and cheers. This can't be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button variant="destructive" onClick={doDelete} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Delete post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report */}
      <Dialog open={!!reporting} onOpenChange={(o) => { if (!o) { setReporting(null); setReportReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this post</DialogTitle>
            <DialogDescription>
              It will be hidden from your feed right away. Tell us what's wrong if you'd like (optional).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="e.g. spam, unkind, unsafe health advice"
            maxLength={300}
            className="min-h-20 resize-none"
            aria-label="Reason for reporting (optional)"
          />
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={doReport} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Send report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
