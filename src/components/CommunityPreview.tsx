import { useEffect, useState } from "react";
import { ArrowRight, Heart, MessageCircle, Users } from "lucide-react";
import { SectionLabel, softCardCls } from "./HabitCard";
import { fetchPosts, initialsOf, timeAgo, topicInfo, type Post } from "../lib/community";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * "From the community" on the Habits page: the three newest posts and a way
 * into the full Community page. Quietly renders nothing if the feed can't be
 * reached, so it never gets in the way of logging habits.
 */
export default function CommunityPreview({ userId, onOpen }: { userId: string; onOpen: () => void }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPosts(userId, { limit: 3 })
      .then(({ posts }) => !cancelled && setPosts(posts))
      .catch(() => !cancelled && setFailed(true));
    return () => { cancelled = true; };
  }, [userId]);

  if (failed) return null;

  return (
    <section className="space-y-4">
      <SectionLabel>From the community</SectionLabel>
      <Card className={softCardCls}>
        <CardContent className="space-y-4">
          {posts === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : posts.length === 0 ? (
            <div className="flex flex-wrap items-center gap-4">
              <span className="grid size-10 place-items-center rounded-lg bg-primary/8" aria-hidden="true">
                <Users className="size-5 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">The community is just getting started</p>
                <p className="text-sm text-muted-foreground">Share a win or ask a question to kick things off.</p>
              </div>
              <Button onClick={onOpen}>Open community <ArrowRight /></Button>
            </div>
          ) : (
            <>
              <ul className="divide-y">
                {posts.map((p) => {
                  const topic = topicInfo(p.topic);
                  return (
                    <li key={p.id}>
                      <button
                        onClick={onOpen}
                        className="flex w-full gap-3 rounded-md py-3 text-left transition-colors outline-none first:pt-0 hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <Avatar size="sm">
                          <AvatarFallback className="bg-muted text-xs">{initialsOf(p.authorName)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{p.authorName}</span>
                            <span aria-hidden="true">·</span>
                            <topic.icon className="size-3" aria-hidden="true" />
                            {topic.label}
                            <span aria-hidden="true">·</span>
                            {timeAgo(p.createdAt)}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-sm">{p.body}</p>
                          <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><Heart className="size-3" aria-hidden="true" />{p.cheers}</span>
                            <span className="inline-flex items-center gap-1"><MessageCircle className="size-3" aria-hidden="true" />{p.comments}</span>
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <Button variant="outline" onClick={onOpen}>
                See all posts <ArrowRight />
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
