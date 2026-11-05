"use client";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input } from "antd";
import {
  ArrowUpOutlined,
  PlusOutlined,
  RobotOutlined,
  StopOutlined,
  UserOutlined,
} from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { shouldSendOnEnter } from "@/lib/insight";
import {
  readGovernanceStream,
  type GovernanceSource,
} from "@/lib/governance-stream";

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: GovernanceSource[];
  graphStatus?: string;
  state?: "streaming" | "done" | "stopped" | "error";
};
const prompts = [
  { label: "授权到期", question: "经理层授权到期需要办理哪些手续？" },
  { label: "重大事项", question: "一项重大投资提交董事会前需要什么材料？" },
  { label: "自查整改", question: "自查发现会议签署不完整，如何整改？" },
];
export default function GovernanceChat({ company }: { company: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const input = useRef<React.ComponentRef<typeof Input.TextArea>>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const box = transcript.current;
    if (box && follow.current) box.scrollTop = box.scrollHeight;
  }, [messages, status]);
  const send = async (q = question) => {
    q = q.trim();
    if (!q || request.current || q.length > 2000) return;
    const abort = new AbortController();
    request.current = abort;
    follow.current = true;
    setQuestion("");
    setBusy(true);
    setError("");
    setStatus("正在读取公司治理依据…");
    const prior = messages.filter(
      (m) => m.content && (m.role === "user" || m.state === "done"),
    );
    setMessages((s) => [
      ...s,
      { role: "user", content: q },
      { role: "assistant", content: "", state: "streaming" },
    ]);
    const update = (
      change: Partial<Message> | ((m: Message) => Partial<Message>),
    ) =>
      setMessages((s) =>
        s.map((m, i) =>
          i === s.length - 1
            ? { ...m, ...(typeof change === "function" ? change(m) : change) }
            : m,
        ),
      );
    try {
      const response = await fetch("/api/governance/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          company,
          question: q,
          history: prior
            .slice(-8)
            .map((m) => ({ role: m.role, content: m.content.slice(0, 16000) })),
        }),
      });
      if (!response.ok)
        throw Error((await response.json()).error || "请求失败，请稍后重试");
      if (!response.body) throw Error("当前连接不支持流式回答，请重试");
      await readGovernanceStream(response.body, (event) => {
        if (event.type === "status") setStatus(event.message);
        if (event.type === "sources")
          update({ sources: event.sources, graphStatus: event.graphStatus });
        if (event.type === "delta") {
          setStatus("正在生成回答…");
          update((m) => ({ content: m.content + event.text }));
        }
        if (event.type === "done") update({ state: "done" });
      });
    } catch (e) {
      update({ state: abort.signal.aborted ? "stopped" : "error" });
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : "回答生成失败，请重试");
    } finally {
      request.current = null;
      setBusy(false);
      setStatus("");
      input.current?.focus();
    }
  };
  return (
    <section className="panel governance-chat" aria-label="智能治理助手对话">
      <header className="governance-chat-header">
        <div className="governance-chat-identity">
          <span className="governance-chat-avatar">
            <RobotOutlined />
          </span>
          <div>
            <strong>治理问答</strong>
            <span>{company} · 公司档案与制度图谱</span>
          </div>
        </div>
        <Button
          icon={<PlusOutlined />}
          disabled={busy || !messages.length}
          onClick={() => {
            setMessages([]);
            setError("");
            setQuestion("");
            input.current?.focus();
          }}
        >
          新对话
        </Button>
      </header>
      <div
        className="governance-chat-transcript"
        ref={transcript}
        onScroll={(e) => {
          const el = e.currentTarget;
          follow.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        }}
      >
        {!messages.length && (
          <div className="governance-chat-welcome">
            <span className="governance-chat-emblem">
              <RobotOutlined />
            </span>
            <h2>从制度要求，到清晰的办理步骤</h2>
            <p>
              询问授权、重大事项、会议履职与合规自查，获取有依据的动作和材料清单。
            </p>
            <div className="governance-chat-prompts">
              {prompts.map((p) => (
                <button
                  key={p.label}
                  disabled={busy}
                  onClick={() => void send(p.question)}
                >
                  <strong>{p.label}</strong>
                  <span>{p.question}</span>
                  <ArrowUpOutlined />
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <article
            key={i}
            className={`governance-chat-message governance-chat-message-${m.role}`}
          >
            <span className="governance-chat-avatar">
              {m.role === "user" ? <UserOutlined /> : <RobotOutlined />}
            </span>
            <div className="governance-chat-message-body">
              <div className="governance-chat-message-label">
                {m.role === "user" ? "我的问题" : "智能治理助手"}
                {m.state === "streaming" && (
                  <span className="governance-chat-status" role="status">
                    {status}
                  </span>
                )}
              </div>
              {m.role === "user" ? (
                <div className="governance-chat-user-text">{m.content}</div>
              ) : (
                <>
                  <div className="governance-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      skipHtml
                      components={{
                        a: ({ node, children, href, ...props }) =>
                          href ? (
                            <a
                              {...props}
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {children}
                            </a>
                          ) : (
                            <span>{children}</span>
                          ),
                        table: ({ node, children, ...props }) => (
                          <div className="governance-markdown-table">
                            <table {...props}>{children}</table>
                          </div>
                        ),
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                    {m.state === "streaming" && !m.content && (
                      <span className="governance-chat-thinking">
                        检索依据后即开始逐步呈现回答<span>•••</span>
                      </span>
                    )}
                  </div>
                  {(m.state === "stopped" || m.state === "error") && (
                    <div className="governance-chat-interrupted">
                      {m.state === "stopped" ? "已停止生成" : "本次生成未完成"}{" "}
                      · {m.content ? "已保留上方内容" : "尚未生成回答"}
                    </div>
                  )}
                  {m.graphStatus && (
                    <details className="governance-chat-sources">
                      <summary>
                        参考依据 · {m.sources?.length || 0} 项图谱结果
                        <span>{m.graphStatus}</span>
                      </summary>
                      <p>
                        公司档案含演练样例；图谱为参考资料，适用性以公司有效制度为准。
                      </p>
                      {m.sources?.map((s, n) => (
                        <div key={n}>
                          <strong>{s.label}</strong>
                          {s.evidence.map((e, k) => (
                            <blockquote key={k}>
                              {e.filename && (
                                <div>
                                  {e.filename}
                                  {e.page ? ` · 第 ${e.page} 页` : ""}
                                </div>
                              )}
                              {e.quote}
                            </blockquote>
                          ))}
                        </div>
                      ))}
                    </details>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      <footer className="governance-chat-composer">
        {error && (
          <Alert
            type="warning"
            showIcon
            title={error}
            closable
            onClose={() => setError("")}
          />
        )}
        {!!messages.length && (
          <div className="governance-chat-quick">
            继续了解：
            {prompts.map((p) => (
              <button
                key={p.label}
                disabled={busy}
                onClick={() => {
                  setQuestion(p.question);
                  input.current?.focus();
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        <div className="governance-chat-input">
          <Input.TextArea
            ref={input}
            aria-label="治理问题"
            value={question}
            maxLength={2000}
            onChange={(e) => setQuestion(e.target.value)}
            autoSize={{ minRows: 2, maxRows: 5 }}
            placeholder="输入治理问题，例如：这项事项由谁审批，需要哪些材料？"
            onKeyDown={(e) => {
              if (
                shouldSendOnEnter({
                  key: e.key,
                  shiftKey: e.shiftKey,
                  isComposing: e.nativeEvent.isComposing,
                  keyCode: e.keyCode,
                })
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div>
            <span>Enter 发送 · Shift + Enter 换行</span>
            {busy ? (
              <Button
                icon={<StopOutlined />}
                onClick={() => request.current?.abort()}
              >
                停止生成
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<ArrowUpOutlined />}
                disabled={!question.trim()}
                onClick={() => void send()}
              >
                发送
              </Button>
            )}
          </div>
        </div>
        <p className="governance-chat-note">
          依据本公司授权范围提供参考建议，办理时请核对有效章程、制度及审批权限。
        </p>
      </footer>
    </section>
  );
}
