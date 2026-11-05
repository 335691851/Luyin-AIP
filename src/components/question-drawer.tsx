"use client";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Drawer, Input, Spin, Tag, Popconfirm } from "antd";
import { CloseOutlined, ArrowUpOutlined } from "@ant-design/icons";
import QuestionResult from "./question-result";
import { useInsightHistory } from "./use-insight-history";
import { shouldSendOnEnter, type InsightTurn } from "@/lib/insight";
function InsightMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M15 4c1.4 7.3 3.7 9.6 11 11-7.3 1.4-9.6 3.7-11 11-1.4-7.3-3.7-9.6-11-11C11.3 13.6 13.6 11.3 15 4Z"
        fill="currentColor"
      />
      <path
        d="M26 2c.5 2.7 1.3 3.5 4 4-2.7.5-3.5 1.3-4 4-.5-2.7-1.3-3.5-4-4 2.7-.5 3.5-1.3 4-4Z"
        fill="currentColor"
        opacity=".7"
      />
    </svg>
  );
}
export default function QuestionDrawer({
  area,
  pageTitle,
  month,
  year,
  company,
  demo,
  enabled = true,
}: {
  area: string;
  pageTitle: string;
  month: string;
  year?: string;
  company: string;
  demo: boolean;
  enabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const history = useInsightHistory(open, demo, enabled);
  const busyRef = useRef(false),
    mounted = useRef(true),
    request = useRef<AbortController | null>(null);
  const [pending, setPending] = useState("");
  const latestTurnRef = useRef<HTMLElement | null>(null);
  const lastTurnId = history.turns.at(-1)?.id;
  useEffect(() => {
    if (open)
      latestTurnRef.current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
  }, [open, lastTurnId]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    try {
      if (!sessionStorage.getItem("luyin-insight-discovered")) {
        setShowHint(true);
        sessionStorage.setItem("luyin-insight-discovered", "1");
      }
    } catch {
      setShowHint(true);
    }
  }, [enabled]);
  useEffect(() => {
    if (!showHint) return;
    const timer = setTimeout(() => setShowHint(false), 8000);
    const dismiss = (e: PointerEvent) => {
      if (e.target instanceof Element && !e.target.closest(".insight-launcher"))
        setShowHint(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [showHint]);
  const launch = () => {
    setShowHint(false);
    setOpen(true);
  };
  const send = async (q = question) => {
    if (!q.trim() || busyRef.current || history.loading) return;
    q = q.trim();
    busyRef.current = true;
    const controller = new AbortController();
    request.current = controller;
    setPending(q);
    setBusy(true);
    setError("");
    try {
      if (area !== "operation")
        throw Error(
          "本页尚未绑定有效制度或管理配置证据，当前不能输出治理判断。",
        );
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          month,
          year,
          company,
          pageTitle,
          conversationId: demo ? undefined : history.activeId || undefined,
        }),
        signal: controller.signal,
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (!mounted.current) return;
      const turn: InsightTurn = demo
        ? {
            id: crypto.randomUUID(),
            question: q,
            answer: d,
            context: { month, year, company, pageTitle },
            createdAt: new Date().toISOString(),
          }
        : d.turn;
      history.append(
        turn,
        d.conversationId || history.activeId || crypto.randomUUID(),
      );
      setQuestion("");
    } catch (e) {
      if (mounted.current && (e as Error).name !== "AbortError")
        setError((e as Error).message);
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
        setPending("");
      }
    }
  };
  if (!enabled) return null;
  return (
    <>
      <div className="insight-launcher">
        {showHint && (
          <aside
            className="insight-discovery"
            role="note"
            aria-label="数据洞察助手使用提示"
          >
            <button
              className="insight-hint-close"
              aria-label="关闭助手提示"
              onClick={() => setShowHint(false)}
            >
              <CloseOutlined aria-hidden />
            </button>
            <span className="insight-eyebrow">AI · 数据洞察</span>
            <b>让数据回答你的问题</b>
            <p>
              {area === "operation"
                ? "沿用当前统计期间和公司范围，直接查询订单销售额、销量等指标。"
                : "保留当前页面上下文，可用数据范围以助手说明为准。"}
            </p>
            <button className="insight-hint-open" onClick={launch}>
              打开数据洞察助手 <span aria-hidden="true">↗</span>
            </button>
          </aside>
        )}
        <button
          className="assistant-fab insight-fab"
          aria-label="打开数据洞察助手"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={launch}
        >
          <span className="insight-emblem">
            <InsightMark />
          </span>
          <b>数据洞察助手</b>
          <small>点我问数据</small>
        </button>
      </div>
      <Drawer
        title={
          <span>
            <span className="insight-title-mark">
              <InsightMark />
            </span>{" "}
            数据洞察助手
          </span>
        }
        open={open}
        onClose={() => setOpen(false)}
        size={900}
        className="question-drawer"
      >
        <div className="question-context">
          <span>当前页面上下文</span>
          <b>{pageTitle}</b>
          <small>
            {year ? `${year}全年` : month} · {company || "全部授权法人"}
          </small>
        </div>
        <div className="question-history-toolbar">
          <label>
            历史会话
            <select
              aria-label="历史会话"
              className="period-select"
              value={history.activeId || ""}
              disabled={busy || history.loading}
              onChange={(e) =>
                e.target.value
                  ? void history.select(e.target.value)
                  : history.create()
              }
            >
              <option value="">新会话</option>
              {history.conversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ·{" "}
                  {new Date(c.updatedAt).toLocaleDateString("zh-CN")}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={busy || history.loading}
            onClick={() => {
              history.create();
              setQuestion("");
              setError("");
            }}
          >
            新建会话
          </Button>
          {history.activeId && (
            <Popconfirm
              title="删除此会话及其问答记录？"
              onConfirm={() => history.remove()}
            >
              <Button disabled={busy || history.loading} danger>
                删除
              </Button>
            </Popconfirm>
          )}
          <small>
            {demo
              ? "演示记录仅保存在当前浏览器"
              : "最近50个会话 · 按账号与权限保存"}
          </small>
        </div>
        <div className="question-thread">
          {history.error && (
            <Alert type="warning" showIcon title={history.error} />
          )}
          {history.loading && (
            <div className="chat-progress">
              <Spin />
              正在读取会话…
            </div>
          )}
          {history.nextCursor && (
            <Button
              block
              loading={history.loading}
              onClick={() => history.loadOlder()}
            >
              加载更早记录
            </Button>
          )}
          {!history.turns.length && !history.loading && (
            <>
              <div className="assistant-greeting">
                <div className="ai-orb">
                  <span className="insight-title-mark">
                    <InsightMark />
                  </span>
                </div>
                <h3>围绕当前页面，继续了解数据</h3>
                <p>保留您的期间、法人筛选，不离开当前工作页面。</p>
              </div>
              {area === "operation" && (
                <div className="question-prompts">
                  {[
                    `${year ? "本年" : "本月"}销售额最高的5个产品`,
                    `${year ? "本年" : "本月"}订单销量前5名`,
                    `${year ? "本年" : "本月"}名义利润最高的5个产品`,
                  ].map((q) => (
                    <button
                      key={q}
                      disabled={busy || history.loading}
                      onClick={() => send(q)}
                    >
                      {q} ↗
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {history.turns.map((turn) => (
            <article
              ref={turn.id === lastTurnId ? latestTurnRef : undefined}
              className="question-turn"
              key={turn.id}
            >
              <div className="user-message">{turn.question}</div>
              <div className="assistant-response">
                <div className="question-turn-meta">
                  <Tag color="red">
                    {turn.answer.mode === "demo"
                      ? "规则演示 · 未调用模型"
                      : "DeepSeek Flash"}
                  </Tag>
                  <small>
                    {turn.context.year
                      ? `${turn.context.year}全年`
                      : turn.context.month}{" "}
                    · {turn.context.company || "全部授权公司"} ·{" "}
                    {new Date(turn.createdAt).toLocaleString("zh-CN")}
                  </small>
                </div>
                <p>{turn.answer.answer}</p>
                <QuestionResult answer={turn.answer} />
                <small>
                  依据：{turn.answer.basis} · 本次返回{turn.answer.sample}行
                </small>
                <details>
                  <summary>查询口径与说明</summary>
                  <p>{turn.answer.query}</p>
                </details>
              </div>
            </article>
          ))}
          {pending && <div className="user-message">{pending}</div>}
          {busy && (
            <div className="chat-progress">
              <Spin /> 正在整理指标与数据依据…
            </div>
          )}
          {error && <Alert type="warning" showIcon title={error} />}
        </div>
        <div className="question-compose">
          <Input.TextArea
            aria-label="业务问题"
            value={question}
            disabled={busy}
            maxLength={1000}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (
                shouldSendOnEnter({
                  key: e.key,
                  shiftKey: e.shiftKey,
                  isComposing: e.nativeEvent.isComposing,
                  keyCode: e.nativeEvent.keyCode,
                })
              ) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="请输入您想了解的问题…"
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
          <div>
            <small>Enter 发送 · Shift+Enter 换行 · 中文输入选字时不发送</small>
            <Button
              type="primary"
              aria-label="发送问题"
              icon={<ArrowUpOutlined aria-hidden />}
              loading={busy}
              disabled={!question.trim() || history.loading}
              onClick={() => send()}
            >
              发送
            </Button>
          </div>
        </div>
      </Drawer>
    </>
  );
}
