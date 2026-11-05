"use client";
import { useState } from "react";
import { Alert, Button, Input, Tag } from "antd";
export default function GovernanceChat({ company }: { company: string }) {
  const [messages, setMessages] = useState<
      { role: "user" | "assistant"; content: string }[]
    >([]),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const send = async (q = question) => {
    if (!q.trim() || busy) return;
    setQuestion("");
    setBusy(true);
    setError("");
    const prior = messages;
    setMessages((s) => [...s, { role: "user", content: q }]);
    try {
      const r = await fetch("/api/governance/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          question: q,
          history: prior.slice(-8),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setMessages((s) => [...s, { role: "assistant", content: d.answer }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel governance-chat">
      <Tag color="red">智能治理助手 · {company}</Tag>
      <h2>制度要求，转化为可办理的治理动作</h2>
      <p>
        结合本公司档案样例与关联图谱，询问授权、决策程序、会议履职和自查材料。
      </p>
      <div className="question-prompts">
        {[
          "经理层授权到期需要办理哪些手续？",
          "一项重大投资提交董事会前需要什么材料？",
          "自查发现会议签署不完整，如何整改？",
        ].map((q) => (
          <button key={q} onClick={() => void send(q)}>
            {q}
          </button>
        ))}
      </div>
      <div
        aria-live="polite"
        style={{
          minHeight: 300,
          maxHeight: 600,
          overflowY: "auto",
          padding: "20px 0",
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user" ? "user-message" : "assistant-response"
            }
            style={{ whiteSpace: "pre-wrap", marginBottom: 16 }}
          >
            {m.content}
          </div>
        ))}
        {busy && <p>正在检索制度与整理办理建议…</p>}
      </div>
      {error && <Alert type="warning" title={error} />}
      <Input.TextArea
        aria-label="治理问题"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={3}
        placeholder="输入制度、规范、合规或公司治理问题"
      />
      <Button
        type="primary"
        loading={busy}
        onClick={() => void send()}
        style={{ marginTop: 12 }}
      >
        发送
      </Button>
    </section>
  );
}
