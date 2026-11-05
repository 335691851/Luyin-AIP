"use client";
import { useEffect, useRef } from "react";
import { Button, Space } from "antd";
import { PlusOutlined, MinusOutlined } from "@ant-design/icons";
import * as echarts from "echarts/core";
import { GraphChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { GraphNode, GraphEdge } from "@/lib/knowledge-graph";
echarts.use([GraphChart, TooltipComponent, CanvasRenderer]);

const palette = [
  "#7452b6",
  "#3d79b5",
  "#c58a35",
  "#3c938a",
  "#bd6176",
  "#6776b5",
  "#71864a",
];
export default function KnowledgeGraphCanvas({
  nodes,
  edges,
  ontology,
  labels,
  selected,
  resetKey,
  onNode,
  onEdge,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  ontology: boolean;
  labels: boolean;
  selected: string | null;
  resetKey: number;
  onNode: (id: string) => void;
  onEdge: (id: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.EChartsType | null>(null);
  const handlers = useRef({ onNode, onEdge });
  useEffect(() => {
    handlers.current = { onNode, onEdge };
  }, [onNode, onEdge]);
  useEffect(() => {
    if (!element.current) return;
    const instance = echarts.init(element.current, undefined, {
      renderer: "canvas",
    });
    chart.current = instance;
    instance.on("click", (event) => {
      const data = event.data as { rawId?: string; edgeId?: string };
      if (event.dataType === "edge" && data.edgeId)
        handlers.current.onEdge(data.edgeId);
      else if (data.rawId) handlers.current.onNode(data.rawId);
    });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;

    const degrees = new Map<string, number>();
    for (const edge of edges)
      for (const id of [edge.source, edge.target])
        degrees.set(id, (degrees.get(id) || 0) + 1);
    instance.setOption(
      {
        animationDurationUpdate: 200,
        textStyle: { fontFamily: "Microsoft YaHei, PingFang SC, sans-serif" },
        tooltip: {
          renderMode: "richText",
          formatter: (params: unknown) => {
            const event = params as {
              dataType: string;
              data: { fullName?: string; name?: string; relation?: string };
            };
            return event.dataType === "edge"
              ? event.data.relation || "关系"
              : event.data.fullName || event.data.name || "实体";
          },
        },
        series: [
          {
            type: "graph",
            layout: "force",
            roam: true,
            draggable: true,
            zoom: ontology ? 0.65 : 0.7,
            scaleLimit: { min: 0.2, max: 4 },
            force: {
              repulsion: ontology ? 480 : 180,
              edgeLength: ontology ? [90, 160] : [55, 110],
              gravity: 0.06,
              layoutAnimation: false,
            },
            edgeSymbol: ["none", "arrow"],
            edgeSymbolSize: [0, 6],
            emphasis: {
              focus: "adjacency",
              itemStyle: {
                color: "#d58a29",
                borderColor: "#a66821",
                borderWidth: 3,
              },
              lineStyle: { width: 2, opacity: 1 },
            },
            label: {
              show: true,
              position: "right",
              fontSize: 11,
              color: "#334155",
              backgroundColor: "rgba(255,255,255,.8)",
              padding: 2,
            },
            edgeLabel: {
              show: labels,
              fontSize: 9,
              color: "#718096",
              formatter: "{c}",
            },
            lineStyle: {
              color: "#b8c4d4",
              width: 1,
              opacity: 0.65,
              curveness: 0.08,
            },
            data: nodes.map((n, i) => ({
              id: n.id,
              rawId: n.id,
              name: n.label.length > 12 ? `${n.label.slice(0, 12)}…` : n.label,
              fullName: `${n.label} · ${n.typeLabel}`,
              symbolSize: Math.min(
                36,
                14 + Math.sqrt(degrees.get(n.id) || 0) * 3,
              ),
              x: Math.cos((i / Math.max(nodes.length, 1)) * Math.PI * 2) * 220,
              y: Math.sin((i / Math.max(nodes.length, 1)) * Math.PI * 2) * 220,
              itemStyle: {
                color: ontology
                  ? "#7955b4"
                  : palette[
                      Array.from(n.type).reduce(
                        (hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0,
                        0,
                      ) % palette.length
                    ],
                borderColor: "#fff",
                borderWidth: 2,
              },
            })),
            links: edges.map((e) => ({
              source: e.source,
              target: e.target,
              edgeId: e.id,
              value: e.label,
              relation: `${e.label} (${e.predicate})`,
              lineStyle: e.inherited
                ? { type: "dashed", color: "#c8bddb" }
                : undefined,
            })),
          },
        ],
      },
      { notMerge: true },
    );
  }, [nodes, edges, ontology, labels, resetKey]);
  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    instance.dispatchAction({ type: "downplay", seriesIndex: 0 });
    const index = nodes.findIndex((n) => n.id === selected);
    if (index >= 0)
      instance.dispatchAction({
        type: "highlight",
        seriesIndex: 0,
        dataIndex: index,
      });
  }, [selected, nodes]);
  const zoom = (factor: number) => {
    const instance = chart.current;
    if (!instance) return;
    const current =
      (instance.getOption() as { series?: { zoom?: number }[] }).series?.[0]
        ?.zoom || 1;
    instance.setOption({
      series: [{ zoom: Math.min(4, Math.max(0.2, current * factor)) }],
    });
  };
  return (
    <div className="kg-canvas-wrap">
      <div
        ref={element}
        className="kg-canvas"
        role="img"
        aria-label={ontology ? "领域本体交互关系图" : "制度实体交互关系图"}
      />
      <Space className="kg-zoom">
        <Button
          aria-label="放大图谱"
          icon={<PlusOutlined />}
          onClick={() => zoom(1.25)}
        />
        <Button
          aria-label="缩小图谱"
          icon={<MinusOutlined />}
          onClick={() => zoom(0.8)}
        />
      </Space>
      <div className="kg-canvas-hint">
        拖动节点 · 滚轮缩放 · 拖动空白处平移 · 点击节点或连线解析
      </div>
    </div>
  );
}
