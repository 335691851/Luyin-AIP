"use client";
import { useEffect, useState } from "react";
import { Alert, Button, Drawer, Input, Spin, Table, Tag } from "antd";
import { CloseOutlined, ArrowUpOutlined } from "@ant-design/icons";
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
type Answer = {
  answer: string;
  basis: string;
  query: string;
  sample: number;
  metric: string;
  rows: { product: string; value: number }[];
};
export default function QuestionDrawer({
  area,
  pageTitle,
  month,
  company,
  demo,
  enabled = true,
}: {
  area: string;
  pageTitle: string;
  month: string;
  company: string;
  demo: boolean;
  enabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState<Answer | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
    if (!q.trim()) return;
    setQuestion(q);
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      if (area !== "operation")
        throw Error(
          "本页尚未绑定有效制度或管理配置证据，当前不能输出治理判断。",
        );
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, month, company }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setAnswer(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
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
                ? "沿用当前月份和法人，直接查询订单销售额、销量等指标。"
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
        size={490}
        className="question-drawer"
      >
        <div className="question-context">
          <span>当前页面上下文</span>
          <b>{pageTitle}</b>
          <small>
            {month} · {company || "全部授权法人"}
          </small>
        </div>
        <div className="question-thread">
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
                "本月销售额最高的5个产品",
                "本月订单销量前5名",
                "本月名义利润最高的5个产品",
              ].map((q) => (
                <button key={q} onClick={() => send(q)}>
                  {q} ↗
                </button>
              ))}
            </div>
          )}
          {busy && (
            <div className="chat-progress">
              <Spin /> 正在整理指标与数据依据…
            </div>
          )}
          {error && <Alert type="warning" showIcon title={error} />}{" "}
          {answer && (
            <>
              <div className="user-message">{question}</div>
              <div className="assistant-response">
                <Tag color="red">
                  {demo ? "规则演示 · 未调用模型" : "DeepSeek Flash"}
                </Tag>
                <p>{answer.answer}</p>
                <Table
                  rowKey="product"
                  size="small"
                  pagination={false}
                  dataSource={answer.rows}
                  columns={[
                    { title: "产品", dataIndex: "product" },
                    {
                      title: answer.metric === "qty" ? "数量" : "金额（元）",
                      dataIndex: "value",
                      align: "right",
                      render: (v) =>
                        v.toLocaleString("zh-CN", { maximumFractionDigits: 2 }),
                    },
                  ]}
                />
                <small>
                  依据：{answer.basis} · {answer.sample}行样本
                </small>
                <details>
                  <summary>查询口径与说明</summary>
                  <p>{answer.query}</p>
                </details>
              </div>
            </>
          )}
        </div>
        <div className="question-compose">
          <Input.TextArea
            aria-label="业务问题"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="请输入您想了解的问题…"
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
          <div>
            <small>仅文本输入 · 结果保留数据口径</small>
            <Button
              type="primary"
              aria-label="发送问题"
              icon={<ArrowUpOutlined aria-hidden />}
              loading={busy}
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
