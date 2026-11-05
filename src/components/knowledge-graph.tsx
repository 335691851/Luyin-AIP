"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Input,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  ApartmentOutlined,
  SearchOutlined,
  ReloadOutlined,
  AimOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { visibleGraph } from "@/lib/knowledge-graph";
import type { GraphData, GraphDetail } from "@/lib/knowledge-graph";
const Canvas = dynamic(() => import("./knowledge-graph-canvas"), {
  ssr: false,
  loading: () => (
    <div className="kg-loading">
      <Spin />
      正在绘制关系图…
    </div>
  ),
});

export default function KnowledgeGraph() {
  const [view, setView] = useState<"ontology" | "instances">("ontology");
  const [documentId, setDocumentId] = useState("all");
  const [data, setData] = useState<GraphData | null>(null);
  const [meta, setMeta] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [type, setType] = useState("");
  const [isolated, setIsolated] = useState(true),
    [labels, setLabels] = useState(false);
  const [selected, setSelected] = useState<string | null>(null),
    [edgeId, setEdgeId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GraphDetail | null>(null),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState("");
  const [focus, setFocus] = useState<string | null>(null),
    [resetKey, setResetKey] = useState(0),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    setSelected(null);
    setEdgeId(null);
    setDetail(null);
    setFocus(null);
    const params = new URLSearchParams({ view, document: documentId });
    fetch(`/api/knowledge-graph?${params}`, {
      signal: ctrl.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "图谱读取失败");
        return result as GraphData;
      })
      .then((result) => {
        if (!ctrl.signal.aborted) {
          setData(result);
          setMeta(result);
        }
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [view, documentId, reload]);
  useEffect(() => {
    setDetail(null);
    setDetailError("");
    setDetailLoading(false);
    if (!selected || view !== "instances") return;
    const ctrl = new AbortController();
    setDetailLoading(true);
    const params = new URLSearchParams({
      view,
      document: documentId,
      iri: selected,
    });
    fetch(`/api/knowledge-graph?${params}`, {
      signal: ctrl.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "实体详情读取失败");
        return result as GraphDetail;
      })
      .then((result) => {
        if (!ctrl.signal.aborted) setDetail(result);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setDetailError(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setDetailLoading(false);
      });
    return () => ctrl.abort();
  }, [selected, view, documentId, reload]);
  const visible = useMemo(
    () =>
      visibleGraph(data || { nodes: [], edges: [] }, {
        search: query,
        type,
        isolated,
        focus,
        limit: 220,
      }),
    [data, query, type, isolated, focus],
  );
  const node = data?.nodes.find((n) => n.id === selected);
  const edge = data?.edges.find((e) => e.id === edgeId);
  const relations =
    data?.edges.filter((e) => e.source === selected || e.target === selected) ||
    [];
  const selectNode = (id: string) => {
    setSelected(id);
    setEdgeId(null);
  };
  const reset = () => {
    setQuery("");
    setType("");
    setFocus(null);
    setSelected(null);
    setEdgeId(null);
    setResetKey((k) => k + 1);
  };
  const changeView = (next: "ontology" | "instances") => {
    setView(next);
    reset();
  };
  const source = meta?.documents.find((d) => d.id === documentId);
  const summary = meta?.summary;
  return (
    <section className="kg-page" aria-label="知识图谱解析工作区">
      <div className="kg-summary-strip">
        <div className="kg-summary-title">
          <span className="kg-symbol">
            <ApartmentOutlined />
          </span>
          <div>
            <b>制度与治理知识网络</b>
            <span>从领域定义到制度实体，沿关系查看原文依据</span>
          </div>
        </div>
        <div className="kg-summary-metrics">
          <span>
            <b>{summary?.documents ?? "—"}</b>制度文件
          </span>
          <span>
            <b>{summary?.classes ?? "—"}</b>本体类型
          </span>
          <span>
            <b>{summary?.objectProperties ?? "—"}</b>对象关系
          </span>
          <span>
            <b>{summary?.entities.toLocaleString("zh-CN") ?? "—"}</b>领域实体
          </span>
        </div>
      </div>
      <div className="kg-toolbar">
        <label>
          查看范围
          <Select
            aria-label="图谱制度范围"
            value={documentId}
            onChange={(id) => {
              setDocumentId(id);
              reset();
            }}
            showSearch
            optionFilterProp="label"
            className="kg-doc-select"
            options={[
              { value: "all", label: "全部制度 · 全域图谱" },
              ...(meta?.documents || []).map((d) => ({
                value: d.id,
                label: d.filename.replace(/\.pdf$/i, ""),
                disabled:
                  d.status !== "completed" ||
                  d.ontology_version !== meta?.ontologyId,
              })),
            ]}
          />
        </label>
        <div className="kg-view-switch" role="group" aria-label="图谱视图">
          <Button
            type={view === "ontology" ? "primary" : "default"}
            onClick={() => changeView("ontology")}
          >
            领域本体
          </Button>
          <Button
            type={view === "instances" ? "primary" : "default"}
            onClick={() => changeView("instances")}
          >
            实体关系
          </Button>
        </div>
        <label>
          查找节点或关系
          <Input
            aria-label="查找图谱节点或关系"
            allowClear
            prefix={<SearchOutlined />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名称、类型或关系"
          />
        </label>
        <label>
          类型
          <Select
            aria-label="图谱类型筛选"
            value={type}
            onChange={setType}
            options={[
              { value: "", label: "全部类型" },
              ...(meta?.types || []).map((t) => ({
                value: t.name,
                label: t.label,
              })),
            ]}
            className="kg-type-select"
          />
        </label>
        <Space wrap>
          <Checkbox
            checked={isolated}
            onChange={(e) => setIsolated(e.target.checked)}
          >
            包含未连线节点
          </Checkbox>
          <Checkbox
            checked={labels}
            onChange={(e) => setLabels(e.target.checked)}
          >
            关系名称
          </Checkbox>
        </Space>
        <Space>
          <Button onClick={reset}>重置视图</Button>
          <Button
            icon={<ReloadOutlined aria-hidden="true" />}
            onClick={() => setReload((n) => n + 1)}
            loading={loading}
          >
            重新读取
          </Button>
        </Space>
      </div>
      <div className="kg-scope-note">
        <span>
          {source?.filename ||
            (view === "ontology"
              ? "全部制度共享同一套领域本体"
              : "全部制度的领域实体；节点属于制度内容，不代表已发生的企业风险")}
        </span>
        <Tag color="purple">{meta?.ontologyId || "OntoRAG"}</Tag>
      </div>
      {error && (
        <Alert type="error" showIcon title="图谱暂未载入" description={error} />
      )}
      <div className="kg-layout" aria-busy={loading}>
        <aside className="kg-panel kg-list-panel">
          <div className="kg-panel-heading">
            <h2>{view === "ontology" ? "本体类" : "制度实体"}</h2>
            <span>{visible.matches.length} 个匹配</span>
          </div>
          <div className="kg-local-metrics">
            <span>
              <b>{data?.nodes.length ?? "—"}</b>
              {view === "ontology" ? "类" : "实体"}
            </span>
            <span>
              <b>{data?.edges.length ?? "—"}</b>关系连线
            </span>
          </div>
          <div className="kg-node-list" aria-label="图谱节点列表">
            {visible.matches.slice(0, 100).map((n) => (
              <button
                type="button"
                key={n.id}
                className={selected === n.id ? "selected" : ""}
                onClick={() => selectNode(n.id)}
              >
                <strong>{n.label}</strong>
                <span>
                  {n.typeLabel} · {visible.degrees.get(n.id) || 0} 条关联
                </span>
              </button>
            ))}
            {!loading && !visible.matches.length && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="没有匹配节点"
              />
            )}
          </div>
          {visible.matches.length > 100 && (
            <div className="kg-list-limit">
              列表展示前100项，请搜索或按类型缩小范围。
            </div>
          )}
        </aside>
        <div className="kg-panel kg-graph-panel">
          <div className="kg-panel-heading">
            <div>
              <h2>{view === "ontology" ? "共享领域本体" : "制度实体关系"}</h2>
              <span>
                {visible.nodes.length} 个可见节点 · {visible.edges.length}{" "}
                条连线{view === "ontology" ? " · 虚线表示类型继承" : ""}
              </span>
            </div>
            {focus && (
              <Button size="small" onClick={() => setFocus(null)}>
                退出一跳视图
              </Button>
            )}
          </div>
          {visible.truncated && (
            <div className="kg-limit-note">
              当前绘制前220个匹配节点；已载入{data?.nodes.length}
              个实体。选择制度、类型或搜索可查看其余节点。
            </div>
          )}
          {loading ? (
            <div className="kg-loading">
              <Spin />
              正在读取OntoRAG图谱…
            </div>
          ) : visible.nodes.length ? (
            <Canvas
              nodes={visible.nodes}
              edges={visible.edges}
              ontology={view === "ontology"}
              labels={labels}
              selected={selected}
              resetKey={resetKey}
              onNode={selectNode}
              onEdge={(id) => {
                setEdgeId(id);
                setSelected(null);
              }}
            />
          ) : (
            <div className="kg-loading">
              <Empty
                description={
                  error ? "读取失败，请重试" : "当前条件没有可展示关系"
                }
              />
            </div>
          )}
        </div>
        <aside className="kg-panel kg-detail-panel" aria-label="图谱解析详情">
          <div className="kg-panel-heading">
            <h2>{edge ? "关系解析" : "节点解析"}</h2>
            <Tag>{view === "ontology" ? "模型定义" : "制度内容"}</Tag>
          </div>
          <div className="kg-detail-body">
            {!node && !edge && (
              <div className="kg-detail-empty">
                <ApartmentOutlined />
                <b>沿关系理解制度要求</b>
                <p>
                  点击左侧列表、图中节点或连线，查看定义、属性、关联及原文依据。
                </p>
                <p>本页为只读解析，不会自动发布规则或认定企业违规。</p>
              </div>
            )}
            {edge && (
              <>
                <h3>{edge.label}</h3>
                <div className="kg-relation-expression">
                  <button onClick={() => selectNode(edge.source)}>
                    {data?.nodes.find((n) => n.id === edge.source)?.label}
                  </button>
                  <ArrowRightOutlined />
                  <button onClick={() => selectNode(edge.target)}>
                    {data?.nodes.find((n) => n.id === edge.target)?.label}
                  </button>
                </div>
                <p>{edge.description}</p>
                <code className="kg-iri">{edge.predicate}</code>
                {view === "instances" && (
                  <p className="kg-muted">
                    可分别查看两端实体的原文依据；实体出处不等于该关系已被逐条核验。
                  </p>
                )}
              </>
            )}
            {node && (
              <>
                <Tag color={view === "ontology" ? "purple" : "blue"}>
                  {node.typeLabel}
                </Tag>
                <h3>{node.label}</h3>
                <Space wrap>
                  <Button
                    size="small"
                    icon={<AimOutlined aria-hidden="true" />}
                    onClick={() => {
                      setQuery("");
                      setType("");
                      setFocus(node.id);
                    }}
                  >
                    仅看一跳关系
                  </Button>
                  <Typography.Text copyable={{ text: node.id }}>
                    复制标识
                  </Typography.Text>
                </Space>
                {node.description && (
                  <>
                    <h4>类型定义</h4>
                    <p>{node.description}</p>
                  </>
                )}
                {node.parent && (
                  <p className="kg-muted">
                    继承自：
                    {meta?.types.find((t) => t.name === node.parent)?.label ||
                      node.parent}
                  </p>
                )}
                {detailLoading && (
                  <div className="kg-detail-loading">
                    <Spin size="small" />
                    读取属性与出处…
                  </div>
                )}
                {detailError && <Alert type="error" title={detailError} />}
                {detail?.conflict && (
                  <Alert
                    type="warning"
                    showIcon
                    title="条款映射冲突 · 待核对"
                    description="同一节点包含多个条号或条文，以下为原始候选，不应直接发布为检查规则。"
                  />
                )}
                {detail && (
                  <>
                    <h4>抽取属性</h4>
                    {detail.properties.length ? (
                      detail.properties.map((p) => (
                        <div className="kg-property" key={p.iri}>
                          <b>{p.label}</b>
                          {p.values.map((v, i) => (
                            <p key={i}>{v}</p>
                          ))}
                        </div>
                      ))
                    ) : (
                      <p className="kg-muted">当前实体没有已抽取的文字属性。</p>
                    )}
                    {detail.propertiesTruncated && (
                      <p className="kg-muted">
                        属性超过在线上限，仅展示前120项。
                      </p>
                    )}
                    <h4>
                      原文依据 <small>{detail.evidence.length} 条引用</small>
                    </h4>
                    {detail.evidence.length ? (
                      detail.evidence.map((e, i) => (
                        <div className="kg-evidence" key={`${e.chunk}-${i}`}>
                          <b>{e.filename}</b>
                          <span>
                            {e.page ? `第${e.page}页` : "页码未提供"} ·{" "}
                            {decodeURIComponent(e.chunk).split("#").at(-1)}
                          </span>
                          <blockquote>{e.quote}</blockquote>
                          {e.documentId && documentId === "all" && (
                            <Button
                              type="link"
                              size="small"
                              onClick={() => {
                                setDocumentId(e.documentId!);
                                setQuery("");
                                setType("");
                              }}
                            >
                              查看该制度图谱
                            </Button>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="kg-muted">
                        未返回可定位摘录，不能据此认为没有制度要求。
                      </p>
                    )}
                    {detail.evidenceTruncated && (
                      <p className="kg-muted">在线展示前60条引用。</p>
                    )}
                    <p className="kg-muted">
                      条文属性可能含摘要；引用为源服务提供的摘录，页码未知时不推定页码。
                    </p>
                  </>
                )}
                <h4>
                  关联关系 <small>{relations.length}</small>
                </h4>
                <div className="kg-relations">
                  {relations.slice(0, 40).map((e) => (
                    <button
                      type="button"
                      key={e.id}
                      onClick={() => {
                        setEdgeId(e.id);
                        setSelected(null);
                      }}
                    >
                      <span>{e.label}</span>
                      <b>
                        {
                          data?.nodes.find(
                            (n) =>
                              n.id ===
                              (e.source === node.id ? e.target : e.source),
                          )?.label
                        }
                      </b>
                    </button>
                  ))}
                  {!relations.length && (
                    <p className="kg-muted">没有已抽取的关联关系。</p>
                  )}
                  {relations.length > 40 && (
                    <p className="kg-muted">
                      展示前40条，请使用一跳视图查看全部邻接节点。
                    </p>
                  )}
                </div>
                <code className="kg-iri">{node.id}</code>
              </>
            )}
          </div>
        </aside>
      </div>
      <div className="kg-data-note">
        <span>
          来源：OntoRAG ·{" "}
          {meta?.loadedAt
            ? `读取于${new Date(meta.loadedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`
            : "等待连接"}{" "}
          · 读取缓存最长30秒
        </span>
        <span>当前全域图谱仅向超级用户开放；制度适用性需另行确认。</span>
      </div>
    </section>
  );
}
