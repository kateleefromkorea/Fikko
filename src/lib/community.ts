import { Lightbulb, MessageCircleQuestion, Sparkles, Trophy, type LucideIcon } from "lucide-react";
import { supabase } from "./supabase";

// Data access for the Community feed. Row-level security (migration 007)
// decides what each member may read and change; the author name and user id
// on new rows are stamped by the database, so none are sent from here.

export type Topic = "win" | "question" | "tip" | "motivation";

export const TOPICS: { key: Topic; label: string; plural: string; icon: LucideIcon }[] = [
  { key: "win", label: "Win", plural: "Wins", icon: Trophy },
  { key: "question", label: "Question", plural: "Questions", icon: MessageCircleQuestion },
  { key: "tip", label: "Tip", plural: "Tips", icon: Lightbulb },
  { key: "motivation", label: "Motivation", plural: "Motivation", icon: Sparkles },
];

export const topicInfo = (key: Topic) => TOPICS.find((t) => t.key === key) ?? TOPICS[0];

export const POST_MAX = 1000;
export const COMMENT_MAX = 500;
export const PAGE_SIZE = 20;

export interface Post {
  id: string;
  userId: string;
  authorName: string;
  topic: Topic;
  body: string;
  createdAt: string;
  cheers: number;
  comments: number;
  cheeredByMe: boolean;
}

export interface Comment {
  id: string;
  userId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

interface PostRow {
  id: string;
  user_id: string;
  author_name: string;
  topic: Topic;
  body: string;
  created_at: string;
  community_cheers?: { count: number }[];
  community_comments?: { count: number }[];
}

const POST_COLUMNS = "id, user_id, author_name, topic, body, created_at";

function toPost(row: PostRow, cheeredByMe: boolean): Post {
  return {
    id: row.id,
    userId: row.user_id,
    authorName: row.author_name,
    topic: row.topic,
    body: row.body,
    createdAt: row.created_at,
    cheers: row.community_cheers?.[0]?.count ?? 0,
    comments: row.community_comments?.[0]?.count ?? 0,
    cheeredByMe,
  };
}

/** Database errors carry technical text; show members something readable. */
function friendly(error: { message: string; code?: string }, fallback: string) {
  // P0001 = the rate-limit messages raised by our own trigger, already friendly.
  if (error.code === "P0001") return new Error(error.message);
  if (error.code === "23514") return new Error("That's too long or empty. Check your post and try again.");
  return new Error(fallback);
}

/** One page of the feed, newest first, optionally filtered to a topic. */
export async function fetchPosts(userId: string, { topic, offset = 0, limit = PAGE_SIZE }: { topic?: Topic; offset?: number; limit?: number } = {}) {
  let query = supabase
    .from("community_posts")
    .select(`${POST_COLUMNS}, community_cheers(count), community_comments(count)`)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (topic) query = query.eq("topic", topic);

  const { data, error } = await query;
  if (error) throw friendly(error, "Couldn't load the community feed.");
  const rows = (data ?? []) as PostRow[];

  // Which of these posts has the current member already cheered?
  const mine = new Set<string>();
  if (rows.length) {
    const { data: cheers } = await supabase
      .from("community_cheers")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", rows.map((r) => r.id));
    for (const c of cheers ?? []) mine.add(c.post_id);
  }

  return { posts: rows.map((r) => toPost(r, mine.has(r.id))), hasMore: rows.length === limit };
}

export async function createPost(topic: Topic, body: string): Promise<Post> {
  const { data, error } = await supabase
    .from("community_posts")
    .insert({ topic, body: body.trim() })
    .select(POST_COLUMNS)
    .single();
  if (error) throw friendly(error, "Couldn't share your post. Please try again.");
  return toPost(data as PostRow, false);
}

export async function deletePost(postId: string) {
  const { error } = await supabase.from("community_posts").delete().eq("id", postId);
  if (error) throw friendly(error, "Couldn't delete the post.");
}

export async function setCheer(postId: string, userId: string, cheer: boolean) {
  const { error } = cheer
    ? await supabase.from("community_cheers").insert({ post_id: postId })
    : await supabase.from("community_cheers").delete().eq("post_id", postId).eq("user_id", userId);
  // 23505: already cheered (e.g. double click) — the end state is the same.
  if (error && error.code !== "23505") throw friendly(error, "Couldn't update your cheer.");
}

/** Files a report. Resolves true if this member had already reported it. */
export async function reportPost(postId: string, reason?: string) {
  const { error } = await supabase.from("community_reports").insert({ post_id: postId, reason: reason?.trim() || null });
  if (error?.code === "23505") return true;
  if (error) throw friendly(error, "Couldn't send your report.");
  return false;
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("community_comments")
    .select("id, user_id, author_name, body, created_at")
    .eq("post_id", postId)
    .order("created_at");
  if (error) throw friendly(error, "Couldn't load comments.");
  return (data ?? []).map((r) => ({ id: r.id, userId: r.user_id, authorName: r.author_name, body: r.body, createdAt: r.created_at }));
}

export async function addComment(postId: string, body: string): Promise<Comment> {
  const { data, error } = await supabase
    .from("community_comments")
    .insert({ post_id: postId, body: body.trim() })
    .select("id, user_id, author_name, body, created_at")
    .single();
  if (error) throw friendly(error, "Couldn't post your comment.");
  return { id: data.id, userId: data.user_id, authorName: data.author_name, body: data.body, createdAt: data.created_at };
}

export async function deleteComment(commentId: string) {
  const { error } = await supabase.from("community_comments").delete().eq("id", commentId);
  if (error) throw friendly(error, "Couldn't delete the comment.");
}

/** "just now", "5m", "3h", "2d", then a short date. */
export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function initialsOf(name: string) {
  return name.split(/\s+/).map((p) => p[0]).join("").replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "F";
}
