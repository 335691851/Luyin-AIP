"use client";
import { useEffect, useRef, useState } from "react";
import { useAccess } from "./access-controls";
import type { InsightConversation, InsightTurn } from "@/lib/insight";
type DemoHistory = {
  conversations: InsightConversation[];
  messages: Record<string, InsightTurn[]>;
};
const emptyDemo = (): DemoHistory => ({ conversations: [], messages: {} });
export function useInsightHistory(
  open: boolean,
  demo: boolean,
  enabled: boolean,
) {
  const access = useAccess()?.session;
  const key = `luyin-insight-v1:${JSON.stringify([access?.user.id, access?.role.id, access?.user.scope, access?.user.department, access?.companies, access?.permissions])}`;
  const [conversations, setConversations] = useState<InsightConversation[]>([]),
    [turns, setTurns] = useState<InsightTurn[]>([]),
    [activeId, setActiveId] = useState<string | null>(null),
    [nextCursor, setNextCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0),
    mounted = useRef(true),
    active = useRef<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  function readDemo(): DemoHistory {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") || emptyDemo();
    } catch {
      return emptyDemo();
    }
  }
  function remember(id: string | null) {
    try {
      sessionStorage.setItem(key, id || "new");
    } catch {}
  }
  async function json(url: string, options?: RequestInit) {
    const r = await fetch(url, { cache: "no-store", ...options });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "会话读取失败");
    return d;
  }
  async function select(id: string, before?: string) {
    const version = ++generation.current;
    setLoading(true);
    setError("");
    if (!before) {
      active.current = id;
      setActiveId(id);
      setTurns([]);
      setNextCursor(null);
    }
    try {
      const d = demo
        ? { messages: readDemo().messages[id] || [], nextCursor: null }
        : await json(
            `/api/chat/history?id=${id}${before ? `&before=${before}` : ""}`,
          );
      if (!mounted.current || version !== generation.current) return;
      setTurns((previous) =>
        before
          ? [
              ...d.messages,
              ...previous.filter(
                (t) => !d.messages.some((m: InsightTurn) => m.id === t.id),
              ),
            ]
          : d.messages,
      );
      setNextCursor(d.nextCursor);
      remember(id);
    } catch (e) {
      if (mounted.current && version === generation.current)
        setError((e as Error).message);
    } finally {
      if (mounted.current && version === generation.current) setLoading(false);
    }
  }
  function create() {
    generation.current++;
    active.current = null;
    setActiveId(null);
    setTurns([]);
    setNextCursor(null);
    setError("");
    setLoading(false);
    remember(null);
  }
  useEffect(() => {
    if (!open || !enabled || !access) return;
    const version = ++generation.current;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const list: InsightConversation[] = demo
          ? readDemo().conversations
          : (await json("/api/chat/history")).conversations;
        if (!mounted.current || version !== generation.current) return;
        setConversations(list);
        let saved: string | null = null;
        try {
          saved = sessionStorage.getItem(key);
        } catch {}
        const id = list.some((c) => c.id === active.current)
          ? active.current
          : saved === "new"
            ? null
            : list.find((c) => c.id === saved)?.id || list[0]?.id;
        if (id) await select(id);
        else {
          active.current = null;
          setActiveId(null);
          setTurns([]);
          setLoading(false);
        }
      } catch (e) {
        if (mounted.current && version === generation.current) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    })();
    // Requests are keyed by the authenticated workspace and revalidated on each drawer opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, demo, enabled, key]);
  function append(turn: InsightTurn, id: string) {
    generation.current++;
    setLoading(false);
    active.current = id;
    setActiveId(id);
    remember(id);
    setTurns((previous) => [...previous, turn]);
    const existing = conversations.find((c) => c.id === id);
    const list = [
      {
        id,
        title: existing?.title || turn.question.slice(0, 100),
        updatedAt: turn.createdAt,
      },
      ...conversations.filter((c) => c.id !== id),
    ].slice(0, 50);
    setConversations(list);
    if (demo) {
      try {
        const cache = readDemo();
        cache.conversations = list.slice(0, 10);
        cache.messages[id] = [...(cache.messages[id] || []), turn].slice(-20);
        for (const old of Object.keys(cache.messages))
          if (!cache.conversations.some((c) => c.id === old))
            delete cache.messages[old];
        localStorage.setItem(key, JSON.stringify(cache));
      } catch {
        setError("演示会话未能保存到浏览器，存储空间可能不足");
      }
    }
  }
  async function remove() {
    if (!activeId) return;
    setLoading(true);
    try {
      if (demo) {
        const data = readDemo();
        data.conversations = data.conversations.filter(
          (c) => c.id !== activeId,
        );
        delete data.messages[activeId];
        localStorage.setItem(key, JSON.stringify(data));
      } else
        await json(`/api/chat/history?id=${activeId}`, { method: "DELETE" });
      setConversations((list) => list.filter((c) => c.id !== activeId));
      create();
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }
  return {
    conversations,
    turns,
    activeId,
    nextCursor,
    loading,
    error,
    select,
    create,
    append,
    remove,
    loadOlder: () =>
      activeId && nextCursor ? select(activeId, nextCursor) : Promise.resolve(),
  };
}
