import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../lib/community";
import type { Post, Topic } from "../lib/community";

/**
 * The Community feed for one member: paging, posting, cheering and removing.
 * Cheers update on screen immediately and roll back if the server refuses.
 */
export function useCommunityFeed(userId: string | null, topic?: Topic) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ignores responses from a previous filter if the member switches quickly.
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (!userId) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const page = await api.fetchPosts(userId, { topic });
      if (id !== requestId.current) return;
      setPosts(page.posts);
      setHasMore(page.hasMore);
    } catch (err) {
      if (id === requestId.current) setError((err as Error).message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [userId, topic]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function loadMore() {
    if (!userId || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.fetchPosts(userId, { topic, offset: posts.length });
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.posts.filter((p) => !seen.has(p.id))];
      });
      setHasMore(page.hasMore);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  /** Throws with a readable message on failure, so the composer can show it. */
  async function create(postTopic: Topic, body: string) {
    const post = await api.createPost(postTopic, body);
    if (!topic || topic === postTopic) setPosts((prev) => [post, ...prev]);
    return post;
  }

  async function remove(postId: string) {
    await api.deletePost(postId);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  async function toggleCheer(post: Post) {
    if (!userId) return;
    const cheer = !post.cheeredByMe;
    const patch = (p: Post, on: boolean) => ({ ...p, cheeredByMe: on, cheers: Math.max(0, p.cheers + (on ? 1 : -1)) });
    setPosts((prev) => prev.map((p) => (p.id === post.id ? patch(p, cheer) : p)));
    try {
      await api.setCheer(post.id, userId, cheer);
    } catch (err) {
      setPosts((prev) => prev.map((p) => (p.id === post.id ? patch(p, !cheer) : p)));
      setError((err as Error).message);
    }
  }

  /** Reports a post and hides it from this member's feed straight away. */
  async function report(postId: string, reason?: string) {
    await api.reportPost(postId, reason);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  function setCommentCount(postId: string, delta: number) {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, comments: Math.max(0, p.comments + delta) } : p)));
  }

  return { posts, loading, loadingMore, hasMore, error, setError, reload, loadMore, create, remove, toggleCheer, report, setCommentCount };
}
